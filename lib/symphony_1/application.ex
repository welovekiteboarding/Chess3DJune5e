defmodule Symphony1.Application do
  use Application
  require Logger

  alias Symphony1.Core.{
    IssueRunSupervisor,
    MergePoller,
    Policy,
    QueueLauncher,
    QueuePoller,
    QueueScheduler
  }

  alias Symphony1.Observability.EventWriter

  @queue_poller_name Symphony1.Core.RuntimeQueuePoller
  @merge_poller_name Symphony1.Core.RuntimeMergePoller

  @impl true
  def start(_type, _args) do
    children =
      [
        event_writer_child(),
        queue_task_supervisor_child(),
        issue_run_supervisor_child(),
        queue_poller_child(),
        merge_poller_child()
      ]
      |> Enum.reject(&is_nil/1)

    opts = [strategy: :one_for_one, name: Symphony1.Supervisor]
    Supervisor.start_link(children, opts)
  end

  def queue_poller_name, do: @queue_poller_name
  def merge_poller_name, do: @merge_poller_name

  def event_writer_child do
    EventWriter
  end

  def queue_poller_child(runtime \\ Application.get_env(:symphony_1, :queue_runtime, %{})) do
    if Map.get(runtime, :enabled, false) do
      run_attrs = Map.fetch!(runtime, :run_attrs)
      workflow_path = Map.fetch!(run_attrs, :workflow_path)
      interval_ms = Map.get(runtime, :interval_ms, 1_000)

      {:ok, workflow} = Policy.load_workflow_config(workflow_path)

      queue_scheduler =
        QueueScheduler.new(
          max_concurrent_agents: get_in(workflow, ["agent", "max_concurrent_agents"]) || 1,
          launcher:
            &QueueLauncher.launch(&1, task_supervisor: Symphony1.Core.QueueTaskSupervisor),
          error_reporter: &report_queue_scheduler_event/1
        )

      {QueuePoller,
       name: @queue_poller_name,
       issue_run_supervisor: Symphony1.Core.IssueRunSupervisor,
       interval_ms: interval_ms,
       queue_scheduler: queue_scheduler,
       result_reporter: &report_queue_poller_event/1,
       run_attrs: run_attrs,
       task_supervisor: Symphony1.Core.QueueTaskSupervisor}
    end
  end

  def merge_poller_child(runtime \\ Application.get_env(:symphony_1, :merge_runtime, %{})) do
    if Map.get(runtime, :enabled, false) do
      merge_attrs = Map.fetch!(runtime, :merge_attrs)
      interval_ms = Map.get(runtime, :interval_ms, 1_000)

      {MergePoller,
       name: @merge_poller_name,
       interval_ms: interval_ms,
       merge_attrs: merge_attrs,
       result_reporter: &report_merge_poller_event/1,
       task_supervisor: Symphony1.Core.QueueTaskSupervisor}
    end
  end

  def queue_task_supervisor_child do
    {Task.Supervisor, name: Symphony1.Core.QueueTaskSupervisor}
  end

  def issue_run_supervisor_child do
    {IssueRunSupervisor, name: Symphony1.Core.IssueRunSupervisor}
  end

  def start_queue_runtime(runtime) when is_map(runtime) do
    ensure_runtime_started(
      :queue_runtime,
      :queue,
      runtime,
      @queue_poller_name,
      &queue_poller_child/1
    )
  end

  def start_merge_runtime(runtime) when is_map(runtime) do
    ensure_runtime_started(
      :merge_runtime,
      :merge,
      runtime,
      @merge_poller_name,
      &merge_poller_child/1
    )
  end

  defp ensure_runtime_started(env_key, runtime_name, runtime, process_name, child_builder) do
    case Process.whereis(Symphony1.Supervisor) do
      nil ->
        {:error,
         {:runtime_supervisor_not_started,
          %{
            runtime: runtime_name,
            supervisor: Symphony1.Supervisor,
            action:
              "start the :symphony_1 application before starting the continuous #{runtime_name} runtime"
          }}}

      _supervisor_pid ->
        do_ensure_runtime_started(env_key, runtime_name, runtime, process_name, child_builder)
    end
  end

  defp do_ensure_runtime_started(env_key, runtime_name, runtime, process_name, child_builder) do
    case Process.whereis(process_name) do
      nil ->
        case child_builder.(runtime) do
          nil ->
            {:error,
             {:runtime_start_failed,
              %{
                runtime: runtime_name,
                reason: :runtime_disabled,
                action: "provide an enabled runtime configuration before retrying"
              }}}

          child_spec ->
            case Supervisor.start_child(Symphony1.Supervisor, child_spec) do
              {:ok, pid} ->
                Application.put_env(:symphony_1, env_key, runtime)
                {:ok, pid}

              {:error, {:already_started, pid}} ->
                handle_existing_runtime(env_key, runtime_name, runtime, pid)

              {:error, :already_present} ->
                case Process.whereis(process_name) do
                  nil ->
                    {:error,
                     {:runtime_start_failed,
                      %{
                        runtime: runtime_name,
                        reason: :already_present,
                        action: "inspect the application supervisor and retry"
                      }}}

                  pid ->
                    handle_existing_runtime(env_key, runtime_name, runtime, pid)
                end

              {:error, reason} ->
                {:error,
                 {:runtime_start_failed,
                  %{
                    runtime: runtime_name,
                    reason: reason,
                    action: "inspect the application supervisor and retry"
                  }}}
            end
        end

      pid ->
        handle_existing_runtime(env_key, runtime_name, runtime, pid)
    end
  end

  defp handle_existing_runtime(env_key, runtime_name, runtime, pid) do
    current_runtime = Application.get_env(:symphony_1, env_key, %{})

    if current_runtime == runtime do
      Application.put_env(:symphony_1, env_key, runtime)
      {:ok, pid}
    else
      {:error,
       {:runtime_already_running,
        %{
          runtime: runtime_name,
          pid: pid,
          action:
            "stop the existing continuous #{runtime_name} runtime before starting it with new settings"
        }}}
    end
  end

  defp report_queue_scheduler_event({:launch_failed, reason, attrs}) do
    Logger.warning(
      "symphony runtime: queue launch failed reason=#{inspect(reason)} attrs=#{inspect(attrs)}"
    )
  end

  defp report_queue_scheduler_event(event) do
    Logger.info("symphony runtime: queue scheduler event=#{inspect(event)}")
  end

  defp report_queue_poller_event({:run_finished, _ref, result, metadata}) do
    Logger.info(
      "symphony runtime: queue run finished issue=#{inspect(Map.get(metadata, :issue_identifier))} result=#{inspect(result)}"
    )
  end

  defp report_queue_poller_event({:run_down, _ref, reason, metadata}) do
    Logger.warning(
      "symphony runtime: queue run down issue=#{inspect(Map.get(metadata, :issue_identifier))} reason=#{inspect(reason)}"
    )
  end

  defp report_queue_poller_event({:drain_report, %{status: :failure} = report}) do
    Logger.warning("symphony runtime: queue drain report=#{inspect(report)}")
  end

  defp report_queue_poller_event({:run_report, %{status: :failure} = report}) do
    Logger.warning("symphony runtime: queue run report=#{inspect(report)}")
  end

  defp report_queue_poller_event(event) do
    Logger.info("symphony runtime: queue poller event=#{inspect(event)}")
  end

  defp report_merge_poller_event({:merge_report, %{status: :failure} = report}) do
    Logger.warning("symphony runtime: merge report=#{inspect(report)}")
  end

  defp report_merge_poller_event({:merge_report, report}) do
    Logger.info("symphony runtime: merge report=#{inspect(report)}")
  end

  defp report_merge_poller_event(event) do
    Logger.info("symphony runtime: merge poller event=#{inspect(event)}")
  end
end
