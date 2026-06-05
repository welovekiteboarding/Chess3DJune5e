defmodule Symphony1.Core.Idempotency do
  @moduledoc false

  alias Symphony1.Observability.EventLog

  @atom_tag "__idempotency_atom__"
  @version 1
  @unsupported_parent_directory_sync_reasons [:enotsup, :eopnotsupp, :einval]

  @type mode :: :fresh | :replayed
  @type run_spec :: %{
          required(:root) => String.t(),
          required(:scope) => String.t(),
          required(:key) => String.t(),
          required(:fingerprint) => map(),
          optional(:encode_result) => (term() -> term()),
          optional(:decode_result) => (term() -> term()),
          optional(:after_record) => (-> :ok | {:error, term()})
        }

  @spec run(run_spec(), (-> {:ok, term()} | {:error, term()})) ::
          {:ok, term(), mode()} | {:error, term()}
  def run(spec, operation) when is_function(operation, 0) do
    with {:ok, path} <- record_path(spec) do
      EventLog.with_lock(path, fn -> do_run(path, spec, operation) end)
    end
  end

  @spec replay(run_spec()) :: {:ok, term()} | :none | {:error, term()}
  def replay(spec) do
    with {:ok, path} <- record_path(spec) do
      EventLog.with_lock(path, fn -> do_replay(path, spec) end)
    end
  end

  @spec restore_keys(term()) :: term()
  def restore_keys(%{@atom_tag => atom_name}) when is_binary(atom_name),
    do: restore_atom_value(atom_name)

  def restore_keys(value) when is_map(value) do
    Map.new(value, fn
      {key, nested} when is_binary(key) ->
        {restore_key(key), restore_keys(nested)}

      {key, nested} ->
        {key, restore_keys(nested)}
    end)
  end

  def restore_keys(list) when is_list(list), do: Enum.map(list, &restore_keys/1)
  def restore_keys(value), do: value

  defp do_run(path, spec, operation) do
    case do_replay(path, spec) do
      {:ok, result} ->
        {:ok, result, :replayed}

      :none ->
        with {:ok, result} <- operation.(),
             :ok <- persist_record(path, build_record(spec, result)),
             :ok <- maybe_after_record(spec) do
          {:ok, result, :fresh}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp do_replay(path, spec) do
    case load_record(path) do
      {:ok, record} ->
        requested_fingerprint = normalize(Map.fetch!(spec, :fingerprint))
        restored_result = restore_keys(record["result"])

        if record["fingerprint"] == requested_fingerprint do
          {:ok, decode_result(spec, restored_result)}
        else
          :none
        end

      {:error, :file_not_found} ->
        :none

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp maybe_after_record(%{after_record: after_record}) when is_function(after_record, 0) do
    after_record.()
  end

  defp maybe_after_record(_spec), do: :ok

  defp build_record(spec, result) do
    %{
      "version" => @version,
      "scope" => Map.fetch!(spec, :scope),
      "key" => Map.fetch!(spec, :key),
      "fingerprint" => normalize(Map.fetch!(spec, :fingerprint)),
      "result" => spec |> encode_result(result) |> normalize(),
      "recorded_at" => DateTime.utc_now() |> DateTime.to_iso8601()
    }
  end

  defp encode_result(%{encode_result: encoder}, result) when is_function(encoder, 1),
    do: encoder.(result)

  defp encode_result(_spec, result), do: result

  defp decode_result(%{decode_result: decoder}, result) when is_function(decoder, 1),
    do: decoder.(result)

  defp decode_result(_spec, result), do: result

  defp record_path(%{root: root, scope: scope, key: key})
       when is_binary(root) and root != "" and is_binary(scope) and scope != "" and is_binary(key) and
              key != "" do
    digest =
      [scope, key]
      |> Enum.join("\n")
      |> then(&:crypto.hash(:sha256, &1))
      |> Base.url_encode64(padding: false)

    {:ok, Path.join([root, "tmp", "symphony", "idempotency", scope, "#{digest}.json"])}
  end

  defp record_path(_spec), do: {:error, :missing_idempotency_root}

  defp load_record(path) do
    case File.read(path) do
      {:ok, contents} ->
        Jason.decode(contents)

      {:error, :enoent} ->
        {:error, :file_not_found}

      {:error, reason} ->
        {:error, {:idempotency_record_read_failed, reason}}
    end
  end

  defp persist_record(path, record) do
    with :ok <- File.mkdir_p(Path.dirname(path)),
         {:ok, encoded} <- Jason.encode(record, pretty: true) do
      atomic_write(path, encoded <> "\n")
    end
  end

  defp atomic_write(path, contents) do
    temp_path = path <> ".tmp-#{System.unique_integer([:positive])}"

    result =
      case :file.open(String.to_charlist(temp_path), [:write, :binary, :raw]) do
        {:ok, device} ->
          with :ok <- :file.write(device, contents),
               :ok <- :file.datasync(device),
               :ok <- :file.close(device),
               :ok <- File.rename(temp_path, path),
               :ok <- sync_parent_dir(path) do
            :ok
          else
            {:error, reason} -> {:error, {:idempotency_record_write_failed, reason}}
            other -> {:error, {:idempotency_record_write_failed, other}}
          end

        {:error, reason} ->
          {:error, {:idempotency_record_write_failed, reason}}
      end

    case result do
      :ok ->
        :ok

      {:error, _reason} = error ->
        _ = File.rm(temp_path)
        error
    end
  end

  defp sync_parent_dir(path) do
    parent = Path.dirname(path)

    case :file.open(String.to_charlist(parent), [:read, :directory, :raw]) do
      {:ok, device} ->
        result =
          case :file.sync(device) do
            :ok -> :ok
            {:error, reason} when reason in @unsupported_parent_directory_sync_reasons -> :ok
            {:error, reason} -> {:error, reason}
            other -> {:error, other}
          end

        _ = :file.close(device)
        result

      {:error, reason} when reason in @unsupported_parent_directory_sync_reasons ->
        :ok

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp normalize(value) when value in [true, false, nil], do: value
  defp normalize(value) when is_atom(value), do: %{@atom_tag => Atom.to_string(value)}
  defp normalize(%{__struct__: _} = struct), do: struct |> Map.from_struct() |> normalize()

  defp normalize(map) when is_map(map) do
    Map.new(map, fn
      {key, value} when is_atom(key) ->
        {Atom.to_string(key), normalize(value)}

      {key, value} ->
        {key, normalize(value)}
    end)
  end

  defp normalize(list) when is_list(list), do: Enum.map(list, &normalize/1)
  defp normalize(value), do: value

  defp restore_key(key) do
    try do
      String.to_existing_atom(key)
    rescue
      ArgumentError -> key
    end
  end

  defp restore_atom_value(atom_name) do
    try do
      String.to_existing_atom(atom_name)
    rescue
      ArgumentError -> atom_name
    end
  end
end
