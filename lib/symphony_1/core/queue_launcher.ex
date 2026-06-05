defmodule Symphony1.Core.QueueLauncher do
  alias Symphony1.Core.RunCoordinator
  alias Symphony1.Observability.Recorder
  alias Symphony1.Planning.Graph

  @spec launch(map(), keyword()) ::
          {:ok, Task.t(), %{issue_identifier: String.t()}} | :none | {:error, term()}
  def launch(attrs, opts \\ []) do
    attrs = RunCoordinator.normalize_run_attrs(attrs)
    progress_reporter = Map.get(attrs, :progress_reporter, fn _message -> :ok end)
    task_supervisor = Keyword.get(opts, :task_supervisor, Symphony1.Core.QueueTaskSupervisor)
    dispatch_run = Map.get(attrs, :dispatch_run, &dispatch_run/2)
    dispatch_attrs = Map.delete(attrs, :dispatch_run)
    dispatch_timeout_ms = Map.get(attrs, :queue_launch_timeout_ms, 5_000)
    result_owner = Map.get(attrs, :queue_result_owner)

    with {:ok, run} <- RunCoordinator.run_issue(attrs) do
      progress_reporter.("Claimed #{run.issue.identifier} -> #{run.issue.state}")

      record_queue_launch(attrs, run)

      case launch_dispatch_task(
             run,
             dispatch_run,
             dispatch_attrs,
             task_supervisor,
             result_owner,
             dispatch_timeout_ms
           ) do
        {:ok, task} ->
          {:ok, task, %{issue: run.issue, issue_identifier: run.issue.identifier}}

        {:error, reason} ->
          RunCoordinator.recover_claimed_issue_failure(
            run.issue,
            attrs,
            run.workspace,
            :queue_launch_dispatch,
            reason
          )
      end
    else
      :none ->
        :none

      {:error, {:workspace_creation_failed, issue, workspace_path, reason}} ->
        RunCoordinator.recover_workspace_creation_failure(issue, attrs, workspace_path, reason)

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp dispatch_run(%{resume_stage: :finalizing} = run, attrs) do
    RunCoordinator.resume_finalizing_issue(run, attrs)
  end

  defp dispatch_run(run, attrs) do
    RunCoordinator.finish_claimed_issue(run, attrs)
  end

  defp launch_dispatch_task(
         run,
         dispatch_run,
         dispatch_attrs,
         _task_supervisor,
         result_owner,
         timeout_ms
       )
       when is_pid(result_owner) and result_owner != self() do
    request_ref = make_ref()
    caller = self()

    requester =
      spawn(fn ->
        send(
          result_owner,
          {:queue_launch_dispatch, self(), request_ref,
           %{
             issue: run.issue,
             issue_identifier: run.issue.identifier,
             workspace_path: run.workspace
           }, fn -> dispatch_run.(run, dispatch_attrs) end}
        )

        receive do
          {:queue_launch_dispatch, ^request_ref, result} ->
            send(caller, {:queue_launch_dispatch_result, request_ref, result})
        end
      end)

    receive do
      {:queue_launch_dispatch_result, ^request_ref, result} ->
        result
    after
      timeout_ms ->
        Process.exit(requester, :kill)
        {:error, :queue_launch_timeout}
    end
  end

  defp launch_dispatch_task(
         run,
         dispatch_run,
         dispatch_attrs,
         task_supervisor,
         _result_owner,
         _timeout_ms
       ) do
    try do
      {:ok,
       Task.Supervisor.async_nolink(task_supervisor, fn -> dispatch_run.(run, dispatch_attrs) end)}
    rescue
      error ->
        {:error, error}
    catch
      kind, reason ->
        {:error, {kind, reason}}
    end
  end

  defp record_queue_launch(attrs, run) do
    case Map.get(attrs, :observability_root) || Map.get(attrs, :source_repo) do
      nil ->
        :ok

      root ->
        Recorder.record(root, "queue_launch_dispatched",
          issue_identifier: run.issue.identifier,
          graph_task_id: graph_task_id(run.issue, attrs),
          phase: "queue",
          details: %{
            workspace_path: run.workspace,
            branch: Map.get(attrs, :branch, "issue-" <> String.downcase(run.issue.identifier)),
            base_branch: Map.get(attrs, :base_branch)
          }
        )
    end
  end

  defp graph_task_id(issue, %{graph: graph}) do
    case Graph.find_task_by_issue_identifier(graph, issue.identifier) do
      {:ok, task} -> task.id
      :none -> nil
    end
  end

  defp graph_task_id(_issue, _attrs), do: nil
end
