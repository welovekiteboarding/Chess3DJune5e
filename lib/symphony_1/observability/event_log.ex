defmodule Symphony1.Observability.EventLog do
  @moduledoc """
  Append-only JSONL storage helpers for Symphony observability events.

  This module owns append-only file writes and secret redaction. Higher-level
  recorder modules are responsible for deciding which events to write.
  """

  @sensitive_fragments ~w(api_key authorization bearer password secret token)
  @sensitive_value_patterns [
    {~r/(\bauthorization\b\s*:\s*bearer\s+)([^\s]+)/i, "\\1[REDACTED]"},
    {~r/(\b[A-Za-z0-9_]*(?:api[_-]?key|token|password|secret)\b\s*[:=]\s*)([^\s]+)/i,
     "\\1[REDACTED]"}
  ]
  @secret_value_patterns [
    ~r/\bsk-[A-Za-z0-9_-]{8,}\b/,
    ~r/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/
  ]
  @lock_retry_ms 10
  @lock_timeout_ms 5_000

  @type append_opt ::
          {:lock, :already_held | :acquire}
          | {:writer, (String.t(), String.t() -> :ok | {:error, term()})}

  @spec append(String.t(), String.t(), map()) :: :ok | {:error, term()}
  def append(cwd, event, details \\ %{}) when is_binary(cwd) and is_binary(event) do
    append_entry(path(cwd), %{
      timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
      event: event,
      details: details
    })
  end

  @spec sanitize(term()) :: term()
  def sanitize(value), do: redact(value)

  @spec sanitize_value(term()) :: term()
  def sanitize_value(value), do: sanitize(value)

  @spec path(String.t()) :: String.t()
  def path(cwd), do: Path.join([cwd, "tmp", "symphony", "events.jsonl"])

  @spec append_entry(String.t(), map(), [append_opt()]) :: :ok | {:error, term()}
  def append_entry(path, entry, opts \\ [])

  def append_entry(path, entry, opts)
      when is_binary(path) and is_map(entry) and is_list(opts) do
    entry = sanitize(entry)

    with :ok <- File.mkdir_p(Path.dirname(path)),
         {:ok, line} <- Jason.encode(entry),
         :ok <- with_lock(path, fn -> writer(opts).(path, line) end, opts) do
      :ok
    end
  end

  @spec with_lock(String.t(), (-> term()), keyword()) :: term()
  def with_lock(lock_path, fun, opts \\ [])
      when is_binary(lock_path) and is_function(fun, 0) and is_list(opts) do
    case Keyword.get(opts, :lock, :acquire) do
      :already_held -> fun.()
      :acquire -> with_filesystem_lock(lock_path, fun, opts)
    end
  end

  defp redact(%{__struct__: _} = struct), do: struct |> Map.from_struct() |> redact()

  defp redact(%{} = map) do
    Map.new(map, fn {key, value} ->
      if sensitive_key?(to_string(key)) do
        {key, "[REDACTED]"}
      else
        {key, redact(value)}
      end
    end)
  end

  defp redact(list) when is_list(list), do: Enum.map(list, &redact/1)
  defp redact(value) when is_binary(value), do: redact_string(value)
  defp redact(value), do: value

  defp redact_string(value) do
    value =
      Enum.reduce(@sensitive_value_patterns, value, fn {pattern, replacement}, acc ->
        Regex.replace(pattern, acc, replacement)
      end)

    Enum.reduce(@secret_value_patterns, value, fn pattern, acc ->
      Regex.replace(pattern, acc, "[REDACTED]")
    end)
  end

  defp sensitive_key?(key) do
    normalized = String.downcase(key)
    Enum.any?(@sensitive_fragments, &String.contains?(normalized, &1))
  end

  defp writer(opts) do
    Keyword.get(opts, :writer, &default_writer/2)
  end

  defp default_writer(path, line), do: File.write(path, line <> "\n", [:append])

  defp with_filesystem_lock(lock_path, fun, opts) do
    lock_dir = lock_dir(lock_path)

    with :ok <- File.mkdir_p(Path.dirname(lock_dir)),
         :ok <- acquire_lock(lock_dir, opts) do
      run_locked(lock_dir, fun)
    end
  end

  defp acquire_lock(lock_dir, opts) do
    retry_ms = Keyword.get(opts, :lock_retry_ms, @lock_retry_ms)

    deadline_ms =
      System.monotonic_time(:millisecond) + Keyword.get(opts, :lock_timeout_ms, @lock_timeout_ms)

    acquire_lock(lock_dir, retry_ms, deadline_ms)
  end

  defp acquire_lock(lock_dir, retry_ms, deadline_ms) do
    case File.mkdir(lock_dir) do
      :ok ->
        :ok

      {:error, :eexist} ->
        if System.monotonic_time(:millisecond) >= deadline_ms do
          {:error, {:lock_timeout, lock_dir}}
        else
          Process.sleep(retry_ms)
          acquire_lock(lock_dir, retry_ms, deadline_ms)
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp run_locked(lock_dir, fun) do
    case capture_result(fun) do
      {:ok, result} ->
        case File.rmdir(lock_dir) do
          :ok -> result
          {:error, reason} -> {:error, {:lock_release_failed, reason}}
        end

      {:raise, kind, reason, stacktrace} ->
        _ = File.rmdir(lock_dir)
        :erlang.raise(kind, reason, stacktrace)
    end
  end

  defp capture_result(fun) do
    {:ok, fun.()}
  rescue
    error ->
      {:raise, :error, error, __STACKTRACE__}
  catch
    kind, reason ->
      {:raise, kind, reason, __STACKTRACE__}
  end

  defp lock_dir(lock_path), do: Path.expand(lock_path) <> ".lock"
end
