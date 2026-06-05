defmodule Symphony1.Observability.Recorder do
  @moduledoc """
  Durable append-only recorder for normalized Symphony events.
  """

  require Logger

  alias Symphony1.Observability.{EventLog, EventWriter, RuntimeStatus}
  alias Symphony1.Planning.Graph

  @schema_version 1
  @type cycle_context :: %{
          required(:cycle_id) => String.t(),
          required(:graph_path) => String.t(),
          required(:team_key) => String.t() | nil,
          required(:cwd) => String.t(),
          required(:auto_rework) => boolean(),
          required(:auto_rework_continue) => boolean()
        }

  @spec new_cycle_id() :: String.t()
  def new_cycle_id do
    generator =
      Application.get_env(
        :symphony_1,
        :observability_cycle_id_generator,
        &default_cycle_id/0
      )

    generator.()
  end

  @type record_result :: :ok | {:error, term()}

  @spec record(String.t(), String.t(), keyword()) :: record_result()
  def record(cwd, event, opts) when is_binary(cwd) and is_binary(event) and is_list(opts) do
    entry =
      %{
        schema_version: @schema_version,
        timestamp: DateTime.utc_now() |> DateTime.to_iso8601(),
        event: event,
        cycle_id: Keyword.get(opts, :cycle_id),
        issue_identifier: normalize_optional_string(Keyword.get(opts, :issue_identifier)),
        graph_task_id: normalize_optional_string(Keyword.get(opts, :graph_task_id)),
        phase: Keyword.fetch!(opts, :phase) |> to_string(),
        severity: Keyword.get(opts, :severity, "info") |> to_string(),
        details: normalize_details(Keyword.get(opts, :details, %{}))
      }
      |> EventLog.sanitize()

    with :ok <- write_entry(cwd, entry) do
      :ok
    else
      {:error, _reason} = error ->
        log_recording_failure(event, entry, error)
        error
    end
  end

  @spec record_cycle(String.t(), String.t(), keyword()) :: record_result()
  def record_cycle(cwd, event, opts)
      when is_binary(cwd) and is_binary(event) and is_list(opts) do
    context = Keyword.fetch!(opts, :context)
    phase = Keyword.fetch!(opts, :phase)
    details = Keyword.get(opts, :details, %{})
    summary = Keyword.get(opts, :summary)
    graph = Keyword.get(opts, :graph)

    record(cwd, event,
      cycle_id: Map.fetch!(context, :cycle_id),
      phase: phase,
      severity: Keyword.get(opts, :severity, "info"),
      details: build_cycle_details(context, summary, details, graph)
    )
  end

  @spec record_plan_cycle(String.t(), String.t(), keyword()) :: record_result()
  def record_plan_cycle(cwd, event, opts), do: record_cycle(cwd, event, opts)

  @spec record_runtime_status(String.t(), String.t(), String.t() | nil, RuntimeStatus.result()) ::
          record_result()
  def record_runtime_status(cwd, issue_identifier, graph_task_id, result)
      when is_binary(cwd) and is_binary(issue_identifier) and is_map(result) do
    event = RuntimeStatus.recorder_event(result)

    record(cwd, event.event,
      issue_identifier: issue_identifier,
      graph_task_id: graph_task_id,
      phase: "observability",
      severity: runtime_status_severity(result),
      details: event.details
    )
  end

  defp write_entry(cwd, entry) do
    event_writer = Application.get_env(:symphony_1, :observability_event_writer, EventWriter)

    case EventWriter.record(event_writer, cwd, entry) do
      :ok -> :ok
      :unavailable -> EventWriter.write_entry(cwd, entry)
      {:error, _reason} = error -> error
    end
  end

  defp normalize_optional_string(nil), do: nil
  defp normalize_optional_string(""), do: nil
  defp normalize_optional_string(value), do: to_string(value)

  defp normalize_details(nil), do: %{}
  defp normalize_details(details), do: normalize_detail_value(details)

  defp normalize_detail_value(%{__struct__: _} = struct) do
    struct
    |> Map.from_struct()
    |> normalize_detail_value()
  end

  defp normalize_detail_value(%{} = map) do
    Enum.into(map, %{}, fn {key, value} ->
      {key, normalize_detail_value(value)}
    end)
  end

  defp normalize_detail_value(list) when is_list(list) do
    cond do
      list == [] ->
        []

      Keyword.keyword?(list) ->
        Enum.into(list, %{}, fn {key, value} ->
          {key, normalize_detail_value(value)}
        end)

      true ->
        Enum.map(list, &normalize_detail_value/1)
    end
  end

  defp normalize_detail_value(value), do: value

  defp build_cycle_details(context, summary, details, graph) do
    context
    |> Map.take([
      :graph_path,
      :team_key,
      :cwd,
      :auto_rework,
      :auto_rework_continue
    ])
    |> maybe_put_counts(summary)
    |> maybe_put_graph_state(graph)
    |> Map.merge(details)
  end

  defp maybe_put_counts(details, nil), do: details

  defp maybe_put_counts(details, summary) do
    Map.put(details, :counts_by_status, %{
      ready: list_count(Map.get(summary, :ready)),
      blocked: list_count(Map.get(summary, :blocked)),
      done: list_count(Map.get(summary, :done)),
      in_progress: list_count(Map.get(summary, :in_progress)),
      rework: list_count(Map.get(summary, :rework)),
      total: Map.get(summary, :total, 0)
    })
  end

  defp maybe_put_graph_state(details, nil), do: details

  defp maybe_put_graph_state(details, %Graph{} = graph) do
    tracked_tasks =
      graph.tasks
      |> Enum.filter(fn task ->
        task.status == "done" or
          materialized?(task.materialization)
      end)
      |> Enum.map(fn task ->
        %{
          task_id: task.id,
          status: task.status,
          materialized: materialized?(task.materialization),
          linear_issue_id: task.materialization && task.materialization.linear_issue_id,
          linear_issue_identifier:
            task.materialization && task.materialization.linear_issue_identifier
        }
      end)

    if tracked_tasks == [] do
      details
    else
      Map.put(details, :graph_state, %{tasks: tracked_tasks})
    end
  end

  defp list_count(nil), do: 0
  defp list_count(list) when is_list(list), do: length(list)

  defp materialized?(%Graph.Materialization{materialized: true}), do: true
  defp materialized?(_materialization), do: false

  defp runtime_status_severity(%{status: :fail}), do: "warning"
  defp runtime_status_severity(_result), do: "info"

  defp default_cycle_id do
    "cycle-#{System.system_time(:microsecond)}-#{System.unique_integer([:positive, :monotonic])}"
  end

  defp log_recording_failure(event, entry, error) do
    Logger.error(fn ->
      issue_identifier = entry.issue_identifier || "global"
      "failed to record Symphony event #{event} for #{issue_identifier}: #{inspect(error)}"
    end)
  end
end
