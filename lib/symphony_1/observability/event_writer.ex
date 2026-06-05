defmodule Symphony1.Observability.EventWriter do
  @moduledoc """
  Serializes recorder-backed observability writes through a single process when
  the application is running.

  Direct `EventLog.append_entry/3` calls remain available for tests and
  non-application contexts.
  """

  use GenServer

  alias Symphony1.Observability.{EventLog, RunSummary}

  @global_log_segments ["tmp", "symphony", "events.jsonl"]

  @type record_result :: :ok | :unavailable | {:error, term()}

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    {genserver_opts, writer_opts} = Keyword.split(opts, [:name])

    GenServer.start_link(
      __MODULE__,
      writer_opts,
      Keyword.put_new(genserver_opts, :name, __MODULE__)
    )
  end

  @spec record(GenServer.server(), String.t(), map()) :: record_result()
  def record(server \\ __MODULE__, cwd, entry)
      when is_binary(cwd) and is_map(entry) do
    case GenServer.whereis(server) do
      nil ->
        :unavailable

      _pid ->
        try do
          GenServer.call(server, {:record, cwd, entry}, :infinity)
        catch
          :exit, reason -> {:error, {:event_writer_call_failed, reason}}
        end
    end
  end

  @spec write_entry(String.t(), map(), keyword()) :: :ok | {:error, term()}
  def write_entry(cwd, entry, event_log_opts \\ [])
      when is_binary(cwd) and is_map(entry) and is_list(event_log_opts) do
    with :ok <- write_global_event(cwd, entry, event_log_opts),
         :ok <- append_issue_event(cwd, entry, event_log_opts) do
      :ok
    end
  end

  @impl true
  def init(opts) do
    {:ok, %{event_log_opts: Keyword.get(opts, :event_log_opts, [])}}
  end

  @impl true
  def handle_call({:record, cwd, entry}, _from, state) do
    {:reply, write_entry(cwd, entry, state.event_log_opts), state}
  end

  defp append_issue_event(cwd, %{issue_identifier: issue_identifier} = entry, event_log_opts)
       when is_binary(issue_identifier) and issue_identifier != "" do
    lock_path = issue_lock_path(cwd, issue_identifier)
    issue_log_path = run_path(cwd, issue_identifier)

    EventLog.with_lock(
      lock_path,
      fn ->
        with :ok <-
               EventLog.append_entry(
                 issue_log_path,
                 entry,
                 Keyword.merge(event_log_opts, lock: :already_held)
               ),
             :ok <- RunSummary.record_issue_event(cwd, entry, lock: :already_held) do
          :ok
        else
          {:error, _reason} = error -> error
        end
      end
    )
    |> normalize_issue_write_result()
  end

  defp append_issue_event(_cwd, _entry, _event_log_opts), do: :ok

  defp write_global_event(cwd, entry, event_log_opts) do
    case EventLog.append_entry(global_path(cwd), entry, event_log_opts) do
      :ok -> :ok
      {:error, reason} -> {:error, {:global_event_log_write_failed, reason}}
    end
  end

  defp normalize_issue_write_result(:ok), do: :ok

  defp normalize_issue_write_result({:error, {:run_summary_write_failed, _reason}} = error),
    do: error

  defp normalize_issue_write_result({:error, reason}),
    do: {:error, {:issue_event_log_write_failed, reason}}

  defp global_path(cwd), do: Path.join([cwd | @global_log_segments])

  defp run_path(cwd, issue_identifier) do
    Path.join([cwd, "tmp", "symphony", "runs", issue_identifier, "events.jsonl"])
  end

  defp issue_lock_path(cwd, issue_identifier) do
    Path.join([cwd, "tmp", "symphony", "runs", issue_identifier])
  end
end
