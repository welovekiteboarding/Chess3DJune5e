defmodule Symphony1.Core.IssueRunServer do
  use GenServer, restart: :temporary

  @spec start_run(Supervisor.supervisor(), keyword()) :: DynamicSupervisor.on_start_child()
  def start_run(supervisor, opts) do
    DynamicSupervisor.start_child(supervisor, {__MODULE__, opts})
  end

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts)
  end

  @spec snapshot(GenServer.server()) :: map()
  def snapshot(server) do
    GenServer.call(server, :snapshot)
  end

  @impl true
  def init(opts) do
    issue_identifier = Keyword.fetch!(opts, :issue_identifier)
    workspace_path = Keyword.get(opts, :workspace_path)
    dispatch_fun = Keyword.fetch!(opts, :dispatch_fun)
    task_supervisor = Keyword.fetch!(opts, :task_supervisor)
    result_owner = Keyword.get(opts, :result_owner)

    metadata =
      opts
      |> Keyword.get(:metadata, %{})
      |> normalize_metadata(issue_identifier, workspace_path)

    case start_task(task_supervisor, dispatch_fun) do
      {:ok, task} ->
        {:ok,
         %{
           exit_reason: nil,
           final_result: nil,
           issue_identifier: issue_identifier,
           metadata: metadata,
           result_owner: result_owner,
           task: task,
           task_ref: task.ref,
           workspace_path: workspace_path
         }}

      {:error, reason} ->
        {:stop, reason}
    end
  end

  @impl true
  def handle_call(:snapshot, _from, state) do
    {:reply, snapshot_from_state(state), state}
  end

  @impl true
  def handle_info({ref, result}, %{task_ref: ref} = state) do
    if is_pid(state.result_owner) do
      send(state.result_owner, {:issue_run_finished, self(), ref, result})
    end

    {:noreply, %{state | final_result: result}}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, %{task_ref: ref} = state) do
    state =
      if state.final_result == nil do
        if is_pid(state.result_owner) do
          send(state.result_owner, {:issue_run_down, self(), ref, reason})
        end

        %{state | exit_reason: reason}
      else
        state
      end

    {:noreply, state}
  end

  def handle_info(_message, state), do: {:noreply, state}

  defp start_task(task_supervisor, dispatch_fun) do
    try do
      {:ok, Task.Supervisor.async_nolink(task_supervisor, dispatch_fun)}
    rescue
      error ->
        {:error, error}
    catch
      kind, reason ->
        {:error, {kind, reason}}
    end
  end

  defp normalize_metadata(metadata, issue_identifier, workspace_path) when is_map(metadata) do
    metadata
    |> Map.put_new(:issue_identifier, issue_identifier)
    |> maybe_put_workspace_path(workspace_path)
  end

  defp normalize_metadata(_metadata, issue_identifier, workspace_path) do
    %{}
    |> Map.put(:issue_identifier, issue_identifier)
    |> maybe_put_workspace_path(workspace_path)
  end

  defp maybe_put_workspace_path(metadata, nil), do: metadata

  defp maybe_put_workspace_path(metadata, workspace_path),
    do: Map.put(metadata, :workspace_path, workspace_path)

  defp snapshot_from_state(state) do
    %{
      exit_reason: state.exit_reason,
      final_result: state.final_result,
      issue_identifier: state.issue_identifier,
      metadata: state.metadata,
      task: state.task,
      task_ref: state.task_ref,
      workspace_path: state.workspace_path
    }
  end
end
