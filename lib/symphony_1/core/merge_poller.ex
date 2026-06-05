defmodule Symphony1.Core.MergePoller do
  use GenServer

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, Keyword.take(opts, [:name]))
  end

  @impl true
  def init(opts) do
    state = %{
      interval_ms: Keyword.get(opts, :interval_ms, 1_000),
      merge_attrs: Keyword.fetch!(opts, :merge_attrs),
      merge_fun: Keyword.get(opts, :merge_fun, &Symphony1.MergeRuntime.run/1),
      merge_task: nil,
      result_reporter: Keyword.get(opts, :result_reporter, fn _event -> :ok end),
      task_supervisor: Keyword.get(opts, :task_supervisor, Symphony1.Core.QueueTaskSupervisor)
    }

    send(self(), :merge)
    {:ok, state}
  end

  @impl true
  def handle_info(:merge, %{merge_task: nil} = state) do
    task =
      Task.Supervisor.async_nolink(state.task_supervisor, fn ->
        state.merge_fun.(
          once: true,
          cwd: state.merge_attrs.workspace
        )
      end)

    {:noreply, %{state | merge_task: task}}
  end

  def handle_info(:merge, state) do
    {:noreply, state}
  end

  def handle_info({ref, result}, %{merge_task: %Task{ref: ref}} = state) do
    Process.demonitor(ref, [:flush])
    report_merge_result(state.result_reporter, result)
    schedule_next_tick(state.interval_ms)
    {:noreply, %{state | merge_task: nil}}
  end

  def handle_info({:DOWN, ref, :process, _pid, reason}, %{merge_task: %Task{ref: ref}} = state) do
    report_merge_result(state.result_reporter, {:error, reason})
    schedule_next_tick(state.interval_ms)
    {:noreply, %{state | merge_task: nil}}
  end

  defp report_merge_result(reporter, result) do
    reporter.({:merge_report, merge_report(result)})
  end

  defp merge_report({:ok, %{report: report} = result}) when is_map(report) do
    maybe_add_base_refresh_warning(report, Map.get(result, :base_refresh))
  end

  defp merge_report({:ok, %{results: results} = result}) do
    results
    |> basic_merge_report()
    |> maybe_add_base_refresh_warning(Map.get(result, :base_refresh))
  end

  defp merge_report({:error, reason}) do
    %{
      status: :failure,
      reason: reason,
      summary: "Merge poll failed: #{inspect(reason)}."
    }
  end

  defp schedule_next_tick(interval_ms) do
    Process.send_after(self(), :merge, interval_ms)
  end

  defp basic_merge_report([%{issue: issue, pull_request: pull_request}]) do
    %{
      status: :success,
      issue_identifier: Map.get(issue, :identifier),
      pull_request_url: get_in(pull_request, [:url]),
      summary:
        "Merge completed for #{Map.get(issue, :identifier) || "unknown-issue"} -> #{Map.get(issue, :state) || "unknown-state"} (#{get_in(pull_request, [:url]) || "no-pr"})."
    }
  end

  defp basic_merge_report([]) do
    %{
      status: :no_work,
      summary: "Merge poll found no issues in Human Review."
    }
  end

  defp basic_merge_report(results) do
    %{
      status: :success,
      summary: "Merge poll completed with #{length(results)} merge result(s)."
    }
  end

  defp maybe_add_base_refresh_warning(report, {:warning, reason}) do
    warning = %{
      code: :base_refresh_failed,
      reason: reason,
      summary: "Local base refresh failed after merge: #{inspect(reason)}."
    }

    Map.update(report, :warnings, [warning], fn warnings ->
      if Enum.any?(warnings, &(&1 == warning)), do: warnings, else: warnings ++ [warning]
    end)
  end

  defp maybe_add_base_refresh_warning(report, _base_refresh), do: report
end
