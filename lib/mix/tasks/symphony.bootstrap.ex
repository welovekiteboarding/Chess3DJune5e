defmodule Mix.Tasks.Symphony.Bootstrap do
  use Mix.Task

  alias Symphony1.Project.Bootstrap
  alias Symphony1.Project.TeamKey

  @shortdoc "Run the full fresh bootstrap loop through merge and cleanup"
  @usage "usage: mix symphony.bootstrap PROJECT_NAME --owner GITHUB_OWNER"
  @dry_run_deferred_message """
  --dry-run is intentionally deferred for mix symphony.bootstrap.
  Bootstrap is the full scaffold -> setup -> run -> merge proof loop, and this repo does not yet
  expose a read-only preview contract for those combined Linear, GitHub, and filesystem side effects.
  Use the lower-level scaffold, setup, planning, run, and merge commands when you need stepwise inspection.
  """

  @impl true
  def run(args) do
    {opts, positional, invalid} =
      OptionParser.parse(args,
        strict: [
          dry_run: :boolean,
          graph: :string,
          owner: :string,
          private: :boolean,
          public: :boolean,
          root: :string,
          team_key: :string,
          template: :string
        ]
      )

    if invalid != [] do
      Mix.raise(@usage)
    end

    if Keyword.get(opts, :dry_run, false) do
      Mix.raise(@dry_run_deferred_message)
    end

    project_name =
      case positional do
        [name] -> name
        _ -> Mix.raise(@usage)
      end

    github_owner =
      case Keyword.get(opts, :owner) do
        nil -> Mix.raise(@usage)
        owner -> owner
      end

    validate_visibility_opts!(opts)

    bootstrap_runner = Application.get_env(:symphony_1, :bootstrap_runner, &Bootstrap.run/1)

    attrs = %{
      graph_path: Keyword.get(opts, :graph),
      github_owner: github_owner,
      private: Keyword.get(opts, :private, false) and not Keyword.get(opts, :public, false),
      project_name: project_name,
      root_path: Keyword.get(opts, :root, File.cwd!()),
      linear_team_key: bootstrap_team_key(opts, project_name),
      template: Keyword.get(opts, :template, "symphony")
    }

    validate_template_opts!(attrs)

    case bootstrap_runner.(attrs) do
      {:ok, summary} ->
        Mix.shell().info("Bootstrapped #{project_name} at #{summary.project_path}")

        Mix.shell().info(proof_summary_message(summary))

      {:error, reason} ->
        Mix.raise("bootstrap failed: #{inspect(reason)}")
    end
  end

  defp validate_visibility_opts!(opts) do
    if Keyword.get(opts, :public, false) and Keyword.get(opts, :private, false) do
      Mix.raise("cannot pass both --public and --private")
    end
  end

  defp bootstrap_team_key(opts, project_name) do
    case Keyword.get(opts, :team_key) do
      nil -> TeamKey.default_team_key(project_name)
      "" -> TeamKey.default_team_key(project_name)
      team_key -> team_key
    end
  end

  defp validate_template_opts!(%{template: "product-empty", graph_path: nil}) do
    Mix.raise("--template product-empty requires --graph GRAPH_PATH")
  end

  defp validate_template_opts!(%{template: template})
       when template in ["symphony", "product-empty"], do: :ok

  defp validate_template_opts!(%{template: template}) do
    Mix.raise("unknown bootstrap template #{inspect(template)}")
  end

  defp proof_summary_message(%{proof_terminal_state: :human_review} = summary) do
    "Proof issue #{summary.proof_issue_identifier} opened for review via #{summary.proof_pull_request_url}"
  end

  defp proof_summary_message(%{proof_terminal_state: :merged} = summary) do
    "Proof issue #{summary.proof_issue_identifier} merged via #{summary.proof_pull_request_url}"
  end

  defp proof_summary_message(summary) do
    "Proof issue #{summary.proof_issue_identifier} merged via #{summary.merged_pr_url}"
  end
end
