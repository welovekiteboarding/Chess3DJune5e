defmodule Mix.Tasks.Symphony.PlanMaterialize do
  use Mix.Task

  alias Symphony1.Observability.StaleGraphGuard
  alias Symphony1.Planning.{ControlBranchGuard, Graph, Materializer}
  alias Symphony1.RuntimeConfig

  @shortdoc "Materialize the ready batch from a planning graph into Linear"
  @usage "usage: mix symphony.plan_materialize --graph PATH [--team-key KEY] [--dry-run]"

  @impl true
  def run(args) do
    {opts, positional, invalid} =
      OptionParser.parse(args,
        strict: [graph: :string, team_key: :string, dry_run: :boolean]
      )

    if positional != [] or invalid != [] do
      Mix.raise(@usage)
    end

    graph_path =
      case Keyword.get(opts, :graph) do
        nil -> Mix.raise(@usage)
        path -> path
      end

    dry_run? = Keyword.get(opts, :dry_run, false)

    issue_creator =
      Application.get_env(
        :symphony_1,
        :plan_materializer_issue_creator,
        &default_issue_creator/2
      )

    graph_writer =
      Application.get_env(
        :symphony_1,
        :plan_materializer_graph_writer,
        &Graph.persist/2
      )

    recovery_snapshot_writer =
      Application.get_env(
        :symphony_1,
        :plan_materializer_recovery_snapshot_writer,
        &Materializer.default_recovery_snapshot_writer/1
      )

    case Graph.load(graph_path) do
      {:ok, graph} ->
        if Graph.ready_tasks(graph) != [] do
          maybe_raise_on_stale_graph_regression!(graph_path, graph)
        end

        if dry_run? do
          emit_dry_run_preview(graph_path, graph)
        else
          team_key =
            case Keyword.get(opts, :team_key) do
              nil -> Mix.raise(@usage)
              key -> key
            end

          ControlBranchGuard.require_mutation_branch!(graph_path)

          linear_config =
            case RuntimeConfig.linear_config(team_key) do
              {:ok, config} ->
                config

              {:error, :missing_linear_api_key} ->
                Mix.raise(RuntimeConfig.missing_linear_api_key_message())
            end

          case Materializer.materialize_and_persist(
                 graph,
                 linear_config,
                 graph_path,
                 issue_creator: issue_creator,
                 graph_writer: graph_writer,
                 recovery_snapshot_writer: recovery_snapshot_writer
               ) do
            {:ok, result} ->
              Mix.shell().info(
                "Materialized #{length(result.materialized)} task(s), skipped #{length(result.skipped)}"
              )

              invalid_tasks = Map.get(result, :invalid_tasks, [])

              if invalid_tasks != [] do
                Mix.shell().info("Invalid ready tasks: #{length(invalid_tasks)}")
              end

            {:error, %{persistence_failure: _persistence_failure} = error} ->
              if error.materialized != [] do
                Mix.shell().info(
                  "Partial: materialized #{length(error.materialized)} task(s) before failure"
                )
              end

              Mix.raise(Materializer.materialization_error_message(error))

            {:error, error} ->
              if error.materialized != [] do
                Mix.shell().info(
                  "Partial: materialized #{length(error.materialized)} task(s) before failure"
                )
              end

              Mix.raise(Materializer.materialization_error_message(error))
          end
        end

      {:error, reason} ->
        Mix.raise("failed to load graph: #{inspect(reason)}")
    end
  end

  defp emit_dry_run_preview(graph_path, %Graph{} = graph) do
    case Materializer.materialize(
           graph,
           %{},
           dry_run: true,
           graph_path: graph_path
         ) do
      {:ok, preview} ->
        lines =
          [
            "Dry run: #{length(preview.materialized)} ready task(s) would be materialized, #{length(preview.skipped)} would be skipped"
          ] ++
            preview_lines("Ready task preview:", preview.materialized, fn entry ->
              task = task_by_id!(graph, entry.task_id)
              "  #{task.id}: #{task.title}"
            end) ++
            preview_lines(
              "Already materialized ready tasks that would be skipped:",
              preview.skipped,
              fn task_id ->
                task = task_by_id!(graph, task_id)
                identifier = task.materialization.linear_issue_identifier || "unknown-issue"
                "  #{task.id}: #{task.title} [#{identifier}]"
              end
            ) ++
            preview_lines("Invalid ready tasks:", preview.invalid_tasks, fn invalid_task ->
              "  #{invalid_task.task_id}: #{format_invalid_reason(invalid_task.reason)}"
            end) ++
            ["No Linear issues were created."]

        Mix.shell().info(Enum.join(lines, "\n"))

      {:error, error} ->
        Mix.raise(Materializer.materialization_error_message(error))
    end
  end

  defp default_issue_creator(config, attrs) do
    Symphony1.Core.Linear.create_issue(config, attrs)
  end

  defp maybe_raise_on_stale_graph_regression!(graph_path, %Graph{} = graph) do
    case StaleGraphGuard.check(StaleGraphGuard.repo_root_for_graph(graph_path), graph_path, graph) do
      :ok -> :ok
      {:error, error} -> Mix.raise(StaleGraphGuard.error_message(error))
    end
  end

  defp preview_lines(_header, [], _formatter), do: []

  defp preview_lines(header, items, formatter) do
    [header | Enum.map(items, formatter)]
  end

  defp task_by_id!(%Graph{} = graph, task_id) do
    Enum.find(graph.tasks, &(&1.id == task_id)) ||
      raise "task #{inspect(task_id)} missing from dry-run preview graph"
  end

  defp format_invalid_reason({:admission_failed, _task_id, message}), do: message
  defp format_invalid_reason(reason), do: inspect(reason)
end
