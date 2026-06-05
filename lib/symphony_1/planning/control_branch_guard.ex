defmodule Symphony1.Planning.ControlBranchGuard do
  @moduledoc """
  Prevents live graph mutation from the repository's protected base branches.
  """

  alias Symphony1.Observability.StaleGraphGuard

  @protected_branches ~w(main master)

  @spec require_mutation_branch!(String.t()) :: :ok
  def require_mutation_branch!(graph_path) when is_binary(graph_path) do
    repo_root = StaleGraphGuard.repo_root_for_graph(graph_path)
    branch_reader = branch_reader()

    case branch_reader.(repo_root) do
      {:ok, branch} when branch in @protected_branches ->
        Mix.raise("""
        refusing to run graph-mutating Symphony command on #{branch}.

        Create and use a control branch first:
          git checkout -b codex/<name>
        """)

      {:ok, branch} when is_binary(branch) and branch != "" ->
        :ok

      {:ok, _branch} ->
        Mix.raise("""
        refusing to run graph-mutating Symphony command with no branch checked out.

        Create and use a control branch first:
          git checkout -b codex/<name>
        """)

      {:error, reason} ->
        Mix.raise("failed to inspect git branch before graph mutation: #{inspect(reason)}")
    end
  end

  defp branch_reader do
    Application.get_env(:symphony_1, :control_branch_reader, &default_branch_reader/1)
  end

  defp default_branch_reader(repo_root) do
    if Mix.env() == :test do
      {:ok, "test-control-branch"}
    else
      case System.cmd("git", ["-C", repo_root, "branch", "--show-current"],
             stderr_to_stdout: true
           ) do
        {branch, 0} -> {:ok, String.trim(branch)}
        {error, status} -> {:error, {:git_branch_failed, status, String.trim(error)}}
      end
    end
  end
end
