defmodule Mix.Tasks.Symphony.RuntimeStatus do
  use Mix.Task

  alias Symphony1.Observability.RuntimeStatus

  @shortdoc "Check one Symphony run for app-server runtime and recorder health"
  @usage "usage: mix symphony.runtime_status --issue ISSUE-ID [--cwd PATH] [--graph PATH]"

  @impl true
  def run(args) do
    {opts, positional, invalid} =
      OptionParser.parse(args,
        strict: [cwd: :string, issue: :string, graph: :string]
      )

    if positional != [] or invalid != [] do
      Mix.raise(@usage)
    end

    issue_identifier = Keyword.get(opts, :issue) || Mix.raise(@usage)
    cwd = Keyword.get(opts, :cwd, File.cwd!())
    graph_path = Keyword.get(opts, :graph, Path.join([cwd, "planning", "graph.json"]))

    result =
      runtime_status_checker().(cwd,
        issue: issue_identifier,
        graph: graph_path
      )

    Mix.shell().info(RuntimeStatus.render(result))

    if result.status == :fail do
      Mix.raise("runtime status failed")
    end
  end

  defp runtime_status_checker do
    case Application.get_env(:symphony_1, :runtime_status_checker) do
      nil -> &RuntimeStatus.check/2
      fun when is_function(fun, 2) -> fun
    end
  end
end
