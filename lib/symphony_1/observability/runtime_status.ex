defmodule Symphony1.Observability.RuntimeStatus do
  @moduledoc """
  Builds an operator-facing health report for one recorded Symphony run.
  """

  alias Symphony1.Observability.{Artifacts, RunSummary, StaleGraphGuard}
  alias Symphony1.Planning.Graph

  @type check_status :: :pass | :warn | :fail

  @type check :: %{
          status: check_status(),
          label: String.t(),
          detail: String.t()
        }

  @type result :: %{
          status: :pass | :fail,
          issue_identifier: String.t(),
          pull_request_url: String.t() | nil,
          checks: [check()],
          details: map()
        }

  @spec check(String.t(), keyword()) :: result()
  def check(cwd, opts) when is_binary(cwd) and is_list(opts) do
    issue_identifier = Keyword.fetch!(opts, :issue)
    graph_path = Keyword.get(opts, :graph, Path.join([cwd, "planning", "graph.json"]))
    expanded_graph_path = expand_graph_path(cwd, graph_path)
    report = RunSummary.events_report(cwd, issue: issue_identifier, last: 10_000)

    artifact_status =
      report.artifact_status || Artifacts.issue_artifact_status(cwd, issue_identifier)

    checks =
      [
        events_check(report),
        phase_artifact_check("Worker recorder", artifact_status.worker, "worker.jsonl"),
        runtime_check("Worker runtime", artifact_status.worker),
        phase_artifact_check("Review recorder", artifact_status.review, "review.jsonl"),
        runtime_check("Review runtime", artifact_status.review),
        codex_exec_runtime_check(artifact_status.codex_exec_runtime_command),
        codex_exec_text_check(artifact_status.codex_exec_text_mentions),
        graph_check(cwd, expanded_graph_path)
      ]

    %{
      status: result_status(checks),
      issue_identifier: issue_identifier,
      pull_request_url: pull_request_url(report),
      checks: checks,
      details:
        recorder_details(checks, artifact_status, pull_request_url(report), expanded_graph_path)
    }
  end

  @spec recorder_event(result()) :: %{event: String.t(), details: map()}
  def recorder_event(%{status: status, details: details}) do
    %{
      event: runtime_status_event_name(status),
      details: details
    }
  end

  @spec render(result()) :: String.t()
  def render(
        %{issue_identifier: issue_identifier, pull_request_url: pull_request_url, checks: checks} =
          result
      ) do
    lines =
      [
        "Symphony runtime status",
        "Issue: #{issue_identifier}",
        "Pull request: #{pull_request_url || "none recorded"}",
        ""
      ] ++
        Enum.map(checks, &format_check/1) ++
        [
          "",
          summary_line(result.status)
        ]

    Enum.join(lines, "\n")
  end

  defp events_check(%{status: :ok, total_events: total_events}) when total_events > 0 do
    %{status: :pass, label: "Recorder events", detail: "#{total_events} recorded event(s)"}
  end

  defp events_check(%{events_path: events_path}) do
    %{status: :fail, label: "Recorder events", detail: "missing at #{events_path}"}
  end

  defp phase_artifact_check(label, %{present?: true, jsonl_lines: lines}, jsonl_name)
       when is_integer(lines) and lines > 0 do
    %{status: :pass, label: label, detail: "#{jsonl_name} has #{lines} line(s)"}
  end

  defp phase_artifact_check(label, %{present?: true}, jsonl_name) do
    %{status: :fail, label: label, detail: "#{jsonl_name} is missing or empty"}
  end

  defp phase_artifact_check(label, %{path: path}, _jsonl_name) do
    %{status: :fail, label: label, detail: "artifacts absent at #{path}"}
  end

  defp runtime_check(label, %{runtime: "app_server", command: command})
       when is_binary(command) do
    if String.contains?(command, "codex app-server") do
      %{status: :pass, label: label, detail: "app_server via #{command}"}
    else
      %{status: :fail, label: label, detail: "expected app-server command, got #{command}"}
    end
  end

  defp runtime_check(label, status) do
    runtime = fallback(status.runtime)
    command = fallback(status.command)

    %{
      status: :fail,
      label: label,
      detail: "expected app_server command, got #{runtime} via #{command}"
    }
  end

  defp codex_exec_runtime_check(%{present?: false}) do
    %{status: :pass, label: "Codex exec runtime command evidence", detail: "none"}
  end

  defp codex_exec_runtime_check(%{present?: true, paths: paths}) do
    %{
      status: :fail,
      label: "Codex exec runtime command evidence",
      detail: "present in #{Enum.join(paths, ", ")}"
    }
  end

  defp codex_exec_text_check(%{present?: false}) do
    %{status: :pass, label: "Codex exec text mention evidence", detail: "none"}
  end

  defp codex_exec_text_check(%{present?: true, paths: paths}) do
    %{
      status: :warn,
      label: "Codex exec text mention evidence",
      detail: "present in #{Enum.join(paths, ", ")}"
    }
  end

  defp graph_check(cwd, expanded_graph_path) do
    case Graph.load(expanded_graph_path) do
      {:ok, %Graph{} = graph} ->
        case StaleGraphGuard.check(cwd, expanded_graph_path, graph) do
          :ok ->
            %{status: :pass, label: "Graph", detail: "clean at #{expanded_graph_path}"}

          {:error, error} ->
            %{
              status: :fail,
              label: "Graph",
              detail: StaleGraphGuard.error_message(error)
            }
        end

      {:error, :file_not_found} ->
        %{status: :warn, label: "Graph", detail: "not found at #{expanded_graph_path}"}

      {:error, reason} ->
        %{status: :fail, label: "Graph", detail: "failed to load #{inspect(reason)}"}
    end
  end

  defp pull_request_url(%{events: events}) do
    events
    |> Enum.reverse()
    |> Enum.find_value(fn event ->
      event
      |> Map.get("details", %{})
      |> Map.get("pull_request_url")
      |> present_string()
    end)
  end

  defp present_string(value) when is_binary(value) and value != "", do: value
  defp present_string(_value), do: nil

  defp result_status(checks) do
    if Enum.any?(checks, &(&1.status == :fail)), do: :fail, else: :pass
  end

  defp recorder_details(checks, artifact_status, pull_request_url, graph_path) do
    %{
      runtime_status_result: result_status(checks) |> Atom.to_string(),
      graph_path: graph_path,
      worker_runtime: artifact_status.worker.runtime,
      worker_command: artifact_status.worker.command,
      worker_jsonl_lines: artifact_status.worker.jsonl_lines,
      review_runtime: artifact_status.review.runtime,
      review_command: artifact_status.review.command,
      review_jsonl_lines: artifact_status.review.jsonl_lines,
      codex_exec_runtime_command_evidence: artifact_status.codex_exec_runtime_command,
      codex_exec_text_mention_evidence: artifact_status.codex_exec_text_mentions,
      pull_request_url: pull_request_url,
      failed_checks: failed_checks(checks),
      checks: Enum.map(checks, &format_check_entry/1)
    }
  end

  defp failed_checks(checks) do
    checks
    |> Enum.filter(&(&1.status == :fail))
    |> Enum.map(& &1.label)
  end

  defp format_check_entry(%{status: status, label: label, detail: detail}) do
    %{
      status: Atom.to_string(status),
      label: label,
      detail: detail
    }
  end

  defp format_check(%{status: status, label: label, detail: detail}) do
    "#{status |> Atom.to_string() |> String.upcase()} #{label}: #{detail}"
  end

  defp summary_line(:pass), do: "Runtime status result: healthy for app-server loop."

  defp summary_line(:fail),
    do: "Runtime status result: NOT healthy. Fix FAIL items before trusting this run."

  defp fallback(nil), do: "unknown"
  defp fallback(""), do: "unknown"
  defp fallback(value), do: to_string(value)

  defp runtime_status_event_name(:pass), do: "runtime_status_completed"
  defp runtime_status_event_name(:fail), do: "runtime_status_failed"

  defp expand_graph_path(_cwd, "/" <> _rest = graph_path), do: graph_path
  defp expand_graph_path(cwd, graph_path), do: Path.expand(graph_path, cwd)
end
