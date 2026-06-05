defmodule Symphony1.Core.GitGateway do
  @moduledoc """
  Serializes shared git operations per repo root so concurrent work cannot
  collide on shared operator repositories or shared git state.
  """

  alias Symphony1.Observability.EventLog

  @lock_root "symphony_git_gateway"

  @spec run(String.t(), (-> term()), keyword()) :: term()
  def run(repo_root, operation, opts \\ [])
      when is_binary(repo_root) and is_function(operation, 0) and is_list(opts) do
    repo_root
    |> normalize_repo_root()
    |> lock_path()
    |> EventLog.with_lock(operation, lock_opts(opts))
  end

  defp normalize_repo_root(repo_root), do: Path.expand(repo_root)

  defp lock_path(repo_root) do
    digest =
      :crypto.hash(:sha256, repo_root)
      |> Base.url_encode64(padding: false)

    Path.join([System.tmp_dir!(), @lock_root, digest])
  end

  defp lock_opts(opts) do
    Keyword.take(opts, [:lock_retry_ms, :lock_timeout_ms])
  end
end
