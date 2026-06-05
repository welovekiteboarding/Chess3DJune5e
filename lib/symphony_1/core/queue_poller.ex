defmodule Symphony1.Core.QueuePoller do
  use GenServer

  alias Symphony1.Core.IssueRunServer

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, Keyword.take(opts, [:name]))
  end

  @impl true
  def init(opts) do
    state = %{
      deferred_run_events: [],
      drain_fun:
        Keyword.get(opts, :drain_fun, &Symphony1.Core.QueueScheduler.drain_once_with_report/2),
      drain_registered_refs: MapSet.new(),
      drain_snapshot_refs: MapSet.new(),
      drain_task: nil,
      interval_ms: Keyword.get(opts, :interval_ms, 1_000),
      pending_dispatches: %{},
      queue_scheduler: Keyword.fetch!(opts, :queue_scheduler),
      result_reporter: Keyword.get(opts, :result_reporter, fn _event -> :ok end),
      run_monitor_refs: %{},
      run_attrs: Keyword.get(opts, :run_attrs, %{}),
      issue_run_supervisor:
        Keyword.get(opts, :issue_run_supervisor, Symphony1.Core.IssueRunSupervisor),
      task_supervisor: Keyword.get(opts, :task_supervisor, Symphony1.Core.QueueTaskSupervisor)
    }

    send(self(), :drain)
    {:ok, state}
  end

  @impl true
  def handle_info(:drain, %{drain_task: nil} = state) do
    owner_pid = self()

    task =
      Task.Supervisor.async_nolink(state.task_supervisor, fn ->
        state.drain_fun.(
          state.queue_scheduler,
          Map.put(state.run_attrs, :queue_result_owner, owner_pid)
        )
      end)

    {:noreply,
     %{
       state
       | drain_task: task,
         drain_registered_refs: MapSet.new(),
         drain_snapshot_refs: active_run_refs(state.queue_scheduler)
     }}
  end

  def handle_info(:drain, state) do
    {:noreply, state}
  end

  def handle_info({ref, result}, %{drain_task: %Task{ref: ref}} = state) do
    Process.demonitor(ref, [:flush])

    {queue_scheduler, drain_report} = normalize_drain_result(result)

    if drain_report do
      state.result_reporter.({:drain_report, drain_report})
    end

    schedule_next_tick(state.interval_ms)

    updated_state = %{
      state
      | drain_task: nil,
        drain_registered_refs: MapSet.new(),
        drain_snapshot_refs: MapSet.new(),
        queue_scheduler:
          merge_drain_queue_scheduler(
            state.queue_scheduler,
            queue_scheduler,
            state.drain_snapshot_refs,
            state.drain_registered_refs
          )
    }

    {:noreply, replay_deferred_run_events(updated_state)}
  end

  def handle_info({:queue_run_result, ref, result}, state) do
    handle_info({ref, result}, state)
  end

  def handle_info({:queue_launch_dispatch, reply_to, request_ref, metadata, dispatch_fun}, state)
      when is_pid(reply_to) and is_reference(request_ref) and is_map(metadata) and
             is_function(dispatch_fun, 0) do
    {:noreply, enqueue_dispatch(state, reply_to, request_ref, metadata, dispatch_fun)}
  end

  def handle_info({:queue_launch_dispatch, reply_to, request_ref, dispatch_fun}, state)
      when is_pid(reply_to) and is_reference(request_ref) and is_function(dispatch_fun, 0) do
    handle_info({:queue_launch_dispatch, reply_to, request_ref, %{}, dispatch_fun}, state)
  end

  def handle_info({:queue_launch_dispatch_start, request_ref}, state)
      when is_reference(request_ref) do
    {:noreply, start_pending_dispatch(state, request_ref)}
  end

  def handle_info({:queue_monitor_run, reply_to, logical_ref, pid}, state)
      when is_pid(reply_to) and is_reference(logical_ref) and is_pid(pid) do
    monitor_ref = Process.monitor(pid)
    send(reply_to, {:queue_monitor_run, logical_ref, pid, monitor_ref})

    {:noreply,
     %{state | run_monitor_refs: Map.put(state.run_monitor_refs, monitor_ref, logical_ref)}}
  end

  def handle_info({:issue_run_finished, owner_pid, ref, result}, state)
      when is_pid(owner_pid) and is_reference(ref) do
    handle_issue_run_message(state, ref, {:run_finished, result})
  end

  def handle_info({:issue_run_down, owner_pid, ref, reason}, state)
      when is_pid(owner_pid) and is_reference(ref) do
    handle_issue_run_message(state, ref, {:run_down, reason})
  end

  def handle_info({ref, result}, %{queue_scheduler: %{active_runs: active_runs}} = state)
      when is_reference(ref) do
    case Map.get(active_runs, ref) do
      nil ->
        {:noreply, maybe_defer_run_event(state, {:run_finished, ref, result})}

      entry ->
        {:noreply, handle_run_finished(state, ref, result, entry, active_runs)}
    end
  end

  def handle_info(
        {:DOWN, ref, :process, _pid, reason},
        %{drain_task: %Task{ref: ref}} = state
      )
      when is_reference(ref) do
    state.result_reporter.({:drain_report, drain_failure_report(reason, state)})
    schedule_next_tick(state.interval_ms)

    updated_state = %{
      state
      | drain_task: nil,
        drain_registered_refs: MapSet.new(),
        drain_snapshot_refs: MapSet.new()
    }

    {:noreply, replay_deferred_run_events(updated_state)}
  end

  def handle_info(
        {:DOWN, ref, :process, _pid, reason},
        %{queue_scheduler: %{active_runs: active_runs}} = state
      )
      when is_reference(ref) do
    tracked_ref = tracked_run_ref(state.run_monitor_refs, ref)

    case Map.get(active_runs, tracked_ref) do
      nil ->
        {:noreply, maybe_defer_run_event(state, {:run_down, tracked_ref, reason})}

      entry ->
        {:noreply, handle_run_down(state, tracked_ref, reason, entry, active_runs)}
    end
  end

  defp schedule_next_tick(interval_ms) do
    Process.send_after(self(), :drain, interval_ms)
  end

  defp normalize_drain_result({queue_scheduler, report}) when is_map(report),
    do: {queue_scheduler, report}

  defp normalize_drain_result(queue_scheduler), do: {queue_scheduler, nil}

  defp replay_deferred_run_events(%{deferred_run_events: []} = state), do: state

  defp replay_deferred_run_events(state) do
    events = Enum.reverse(state.deferred_run_events)
    state = %{state | deferred_run_events: []}

    Enum.reduce(events, state, fn
      {:run_finished, ref, result}, acc ->
        case get_in(acc, [:queue_scheduler, :active_runs, ref]) do
          nil ->
            acc

          entry ->
            active_runs = get_in(acc, [:queue_scheduler, :active_runs])
            handle_run_finished(acc, ref, result, entry, active_runs)
        end

      {:run_down, ref, reason}, acc ->
        case get_in(acc, [:queue_scheduler, :active_runs, ref]) do
          nil ->
            acc

          entry ->
            active_runs = get_in(acc, [:queue_scheduler, :active_runs])
            handle_run_down(acc, ref, reason, entry, active_runs)
        end
    end)
  end

  defp maybe_defer_run_event(%{drain_task: %Task{}} = state, event) do
    %{state | deferred_run_events: [event | state.deferred_run_events]}
  end

  defp maybe_defer_run_event(state, _event), do: state

  defp merge_drain_queue_scheduler(
         current_scheduler,
         returned_scheduler,
         snapshot_refs,
         registered_refs
       )
       when is_map(current_scheduler) and is_map(returned_scheduler) do
    current_active_runs = Map.get(current_scheduler, :active_runs, %{})
    returned_active_runs = Map.get(returned_scheduler, :active_runs, %{})

    if is_map(current_active_runs) and is_map(returned_active_runs) do
      launched_active_runs =
        returned_active_runs
        |> Map.drop(MapSet.to_list(snapshot_refs))
        |> Map.drop(MapSet.to_list(registered_refs))

      %{returned_scheduler | active_runs: Map.merge(current_active_runs, launched_active_runs)}
    else
      returned_scheduler
    end
  end

  defp merge_drain_queue_scheduler(
         _current_scheduler,
         returned_scheduler,
         _snapshot_refs,
         _registered_refs
       ),
       do: returned_scheduler

  defp enqueue_dispatch(state, reply_to, request_ref, metadata, dispatch_fun) do
    pending_dispatches =
      Map.put(state.pending_dispatches, request_ref, %{
        dispatch_fun: dispatch_fun,
        metadata: ensure_issue_identifier(metadata),
        reply_to: reply_to
      })

    send(self(), {:queue_launch_dispatch_start, request_ref})
    %{state | pending_dispatches: pending_dispatches}
  end

  defp start_pending_dispatch(state, request_ref) do
    case Map.pop(state.pending_dispatches, request_ref) do
      {nil, _pending_dispatches} ->
        state

      {pending_dispatch, pending_dispatches} ->
        state = %{state | pending_dispatches: pending_dispatches}

        if Process.alive?(pending_dispatch.reply_to) do
          {result, updated_state} =
            launch_dispatch_task(
              state,
              pending_dispatch.metadata,
              pending_dispatch.dispatch_fun
            )

          send(pending_dispatch.reply_to, {:queue_launch_dispatch, request_ref, result})
          updated_state
        else
          state
        end
    end
  end

  defp launch_dispatch_task(state, metadata, dispatch_fun) do
    metadata = ensure_issue_run_metadata(metadata)

    case IssueRunServer.start_run(
           state.issue_run_supervisor,
           dispatch_fun: dispatch_fun,
           issue_identifier: Map.fetch!(metadata, :issue_identifier),
           metadata: metadata,
           result_owner: self(),
           task_supervisor: state.task_supervisor,
           workspace_path: Map.get(metadata, :workspace_path)
         ) do
      {:ok, issue_run_owner} ->
        snapshot = IssueRunServer.snapshot(issue_run_owner)

        {{:ok, snapshot.task},
         register_active_run(state, snapshot.task, issue_run_owner, snapshot.metadata)}

      {:error, reason} ->
        {{:error, reason}, state}
    end
  end

  defp register_active_run(state, %Task{} = task, issue_run_owner, metadata) do
    entry = %{
      issue_run_owner: issue_run_owner,
      task: task,
      metadata: ensure_issue_run_metadata(metadata)
    }

    active_runs = get_in(state, [:queue_scheduler, :active_runs])
    monitor_ref = Process.monitor(issue_run_owner)

    if is_map(active_runs) do
      %{
        state
        | queue_scheduler: %{
            state.queue_scheduler
            | active_runs: Map.put(active_runs, task.ref, entry)
          },
          run_monitor_refs: Map.put(state.run_monitor_refs, monitor_ref, task.ref),
          drain_registered_refs: MapSet.put(state.drain_registered_refs, task.ref)
      }
    else
      state
    end
  end

  defp ensure_issue_identifier(metadata) when is_map(metadata) do
    issue_identifier =
      Map.get(metadata, :issue_identifier) || get_in(metadata, [:issue, :identifier])

    if issue_identifier do
      Map.put(metadata, :issue_identifier, issue_identifier)
    else
      metadata
    end
  end

  defp ensure_issue_identifier(metadata), do: metadata

  defp ensure_issue_run_metadata(metadata) do
    metadata
    |> ensure_issue_identifier()
    |> ensure_workspace_path()
  end

  defp ensure_workspace_path(metadata) when is_map(metadata) do
    workspace_path = Map.get(metadata, :workspace_path)

    if workspace_path do
      Map.put(metadata, :workspace_path, workspace_path)
    else
      metadata
    end
  end

  defp ensure_workspace_path(metadata), do: metadata

  defp classify_run_result({:error, reason}, metadata) do
    issue_identifier = Map.get(metadata, :issue_identifier)

    %{
      status: :failure,
      issue_identifier: issue_identifier,
      reason: reason,
      summary: "Queue run failed for #{issue_identifier || "unknown-issue"}: #{inspect(reason)}."
    }
  end

  defp classify_run_result(
         {:ok, %{issue: %{identifier: issue_identifier, state: issue_state}}},
         metadata
       ) do
    %{
      status: :success,
      issue_identifier: Map.get(metadata, :issue_identifier) || issue_identifier,
      summary: "Queue run completed for #{issue_identifier} -> #{issue_state}."
    }
  end

  defp classify_run_result(result, metadata) do
    issue_identifier = Map.get(metadata, :issue_identifier)

    %{
      status: :failure,
      issue_identifier: issue_identifier,
      reason: {:unexpected_run_result, result},
      summary:
        "Queue run returned an unexpected result for #{issue_identifier || "unknown-issue"}: #{inspect(result)}."
    }
  end

  defp down_report(reason, metadata) do
    issue_identifier = Map.get(metadata, :issue_identifier)

    %{
      status: :failure,
      issue_identifier: issue_identifier,
      reason: reason,
      summary:
        "Queue run exited before reporting a result for #{issue_identifier || "unknown-issue"} (reason: #{inspect(reason)})."
    }
  end

  defp drain_failure_report(reason, state) do
    team_key = get_in(state, [:run_attrs, :team_key])

    %{
      status: :failure,
      team_key: team_key,
      active_run_count: active_run_count(state.queue_scheduler),
      issue_identifiers: active_issue_identifiers(state.queue_scheduler),
      reason: reason,
      summary:
        "Queue drain exited before reporting a result for team #{team_key || "unknown-team"} (reason: #{inspect(reason)})."
    }
  end

  defp active_run_refs(%{active_runs: active_runs}) when is_map(active_runs) do
    active_runs
    |> Map.keys()
    |> MapSet.new()
  end

  defp active_run_refs(_queue_scheduler), do: MapSet.new()

  defp active_run_count(%{active_runs: active_runs}) when is_map(active_runs),
    do: map_size(active_runs)

  defp active_run_count(_queue_scheduler), do: 0

  defp active_issue_identifiers(%{active_runs: active_runs}) when is_map(active_runs) do
    active_runs
    |> Map.values()
    |> Enum.reduce([], fn entry, acc ->
      case ensure_issue_identifier(Map.get(entry, :metadata)) do
        %{issue_identifier: issue_identifier} when is_binary(issue_identifier) ->
          [issue_identifier | acc]

        _metadata ->
          acc
      end
    end)
    |> Enum.reverse()
  end

  defp active_issue_identifiers(_queue_scheduler), do: []

  defp handle_run_finished(state, ref, result, entry, active_runs) do
    metadata = issue_run_metadata(entry)
    {monitor_ref, state} = pop_run_monitor_ref(state, ref)
    Process.demonitor(monitor_ref, [:flush])
    state.result_reporter.({:run_finished, ref, result, metadata})
    state.result_reporter.({:run_report, classify_run_result(result, metadata)})
    stop_issue_run_owner(entry)

    %{
      state
      | queue_scheduler: %{state.queue_scheduler | active_runs: Map.delete(active_runs, ref)}
    }
  end

  defp handle_run_down(state, ref, reason, entry, active_runs) do
    metadata = issue_run_metadata(entry)
    {_monitor_ref, state} = pop_run_monitor_ref(state, ref)
    state.result_reporter.({:run_down, ref, reason, metadata})
    state.result_reporter.({:run_report, down_report(reason, metadata)})
    stop_issue_run_owner(entry)

    %{
      state
      | queue_scheduler: %{state.queue_scheduler | active_runs: Map.delete(active_runs, ref)}
    }
  end

  defp pop_run_monitor_ref(state, tracked_ref) do
    case Enum.find(state.run_monitor_refs, fn {_monitor_ref, ref} -> ref == tracked_ref end) do
      {monitor_ref, ^tracked_ref} ->
        {monitor_ref,
         %{state | run_monitor_refs: Map.delete(state.run_monitor_refs, monitor_ref)}}

      nil ->
        {tracked_ref, state}
    end
  end

  defp tracked_run_ref(run_monitor_refs, ref) do
    Map.get(run_monitor_refs, ref, ref)
  end

  defp handle_issue_run_message(
         %{queue_scheduler: %{active_runs: active_runs}} = state,
         ref,
         event
       ) do
    case Map.get(active_runs, ref) do
      nil ->
        case event do
          {:run_finished, result} ->
            {:noreply, maybe_defer_run_event(state, {:run_finished, ref, result})}

          {:run_down, reason} ->
            {:noreply, maybe_defer_run_event(state, {:run_down, ref, reason})}
        end

      entry ->
        case event do
          {:run_finished, result} ->
            {:noreply, handle_run_finished(state, ref, result, entry, active_runs)}

          {:run_down, reason} ->
            {:noreply, handle_run_down(state, ref, reason, entry, active_runs)}
        end
    end
  end

  defp issue_run_metadata(entry) do
    case Map.get(entry, :issue_run_owner) do
      owner when is_pid(owner) ->
        try do
          owner
          |> IssueRunServer.snapshot()
          |> Map.get(:metadata)
          |> ensure_issue_run_metadata()
        catch
          :exit, _reason ->
            ensure_issue_run_metadata(Map.get(entry, :metadata))
        end

      _owner ->
        ensure_issue_run_metadata(Map.get(entry, :metadata))
    end
  end

  defp stop_issue_run_owner(entry) do
    case Map.get(entry, :issue_run_owner) do
      owner when is_pid(owner) ->
        try do
          GenServer.stop(owner, :normal)
        catch
          :exit, _reason -> :ok
        end

      _owner ->
        :ok
    end
  end
end
