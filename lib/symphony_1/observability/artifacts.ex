defmodule Symphony1.Observability.Artifacts do
  @moduledoc """
  Durable and workspace-local artifact path helpers for per-issue recorder data.
  """

  alias Symphony1.Core.Worker

  @type artifact_phase :: :worker | :review
  @type artifact_phase_status :: %{
          present?: boolean(),
          path: String.t(),
          files: [String.t()],
          runtime: String.t() | nil,
          command: String.t() | nil,
          jsonl_lines: non_neg_integer() | nil
        }

  @type artifact_evidence_status :: %{
          present?: boolean(),
          paths: [String.t()]
        }

  @type issue_artifact_status :: %{
          worker: artifact_phase_status(),
          review: artifact_phase_status(),
          codex_exec_runtime_command: artifact_evidence_status(),
          codex_exec_text_mentions: artifact_evidence_status()
        }

  @spec run_dir(String.t(), String.t()) :: String.t()
  def run_dir(repo_root, issue_identifier) do
    Path.join([repo_root, "tmp", "symphony", "runs", issue_identifier])
  end

  @spec worker_dir(String.t(), String.t()) :: String.t()
  def worker_dir(repo_root, issue_identifier) do
    Path.join(run_dir(repo_root, issue_identifier), "worker")
  end

  @spec review_dir(String.t(), String.t()) :: String.t()
  def review_dir(repo_root, issue_identifier) do
    Path.join(run_dir(repo_root, issue_identifier), "review")
  end

  @spec workspace_worker_dir(String.t()) :: String.t()
  def workspace_worker_dir(workspace) do
    Path.join([workspace, ".symphony", "worker"])
  end

  @spec worker_log_paths(String.t(), String.t()) :: keyword()
  def worker_log_paths(repo_root, issue_identifier) do
    Worker.log_paths(:worker, worker_dir(repo_root, issue_identifier))
  end

  @spec review_log_paths(String.t(), String.t()) :: keyword()
  def review_log_paths(repo_root, issue_identifier) do
    Worker.log_paths(:review, review_dir(repo_root, issue_identifier))
  end

  @spec workspace_worker_log_paths(String.t()) :: keyword()
  def workspace_worker_log_paths(workspace) do
    Worker.log_paths(:worker, workspace_worker_dir(workspace))
  end

  @spec preserve_worker_artifacts(String.t(), String.t(), String.t()) ::
          {:ok, %{run_dir: String.t(), worker_dir: String.t(), worker_files: [String.t()]}}
          | {:error, term()}
  def preserve_worker_artifacts(repo_root, issue_identifier, workspace) do
    source_paths = workspace_worker_log_paths(workspace)
    target_paths = worker_log_paths(repo_root, issue_identifier)
    target_dir = Keyword.fetch!(target_paths, :log_dir)

    with :ok <- File.mkdir_p(target_dir),
         {:ok, copied_files} <- copy_existing(source_paths, target_paths, []) do
      {:ok,
       %{
         run_dir: run_dir(repo_root, issue_identifier),
         worker_dir: target_dir,
         worker_files: copied_files
       }}
    end
  end

  @spec describe_review_artifacts(String.t(), String.t()) :: %{
          review_dir: String.t(),
          review_files: [String.t()]
        }
  def describe_review_artifacts(repo_root, issue_identifier) do
    target_paths = review_log_paths(repo_root, issue_identifier)
    review_dir = Keyword.fetch!(target_paths, :log_dir)

    %{
      review_dir: review_dir,
      review_files: existing_files(target_paths)
    }
  end

  @spec issue_artifact_status(String.t(), String.t()) :: issue_artifact_status()
  def issue_artifact_status(repo_root, issue_identifier) do
    worker = phase_status(:worker, worker_log_paths(repo_root, issue_identifier))
    review = phase_status(:review, review_log_paths(repo_root, issue_identifier))

    runtime_command_paths =
      Enum.sort(
        Enum.flat_map([worker, review], fn status ->
          List.wrap(status[:codex_exec_runtime_command_path])
        end)
      )

    text_mention_paths =
      Enum.sort(
        Enum.flat_map([worker, review], fn status ->
          Map.get(status, :codex_exec_text_mention_paths, [])
        end)
      )

    %{
      worker:
        Map.drop(worker, [:codex_exec_runtime_command_path, :codex_exec_text_mention_paths]),
      review:
        Map.drop(review, [:codex_exec_runtime_command_path, :codex_exec_text_mention_paths]),
      codex_exec_runtime_command: %{
        present?: runtime_command_paths != [],
        paths: runtime_command_paths
      },
      codex_exec_text_mentions: %{
        present?: text_mention_paths != [],
        paths: text_mention_paths
      }
    }
  end

  defp copy_existing([], _target_paths, copied_files) do
    {:ok, Enum.sort(copied_files)}
  end

  defp copy_existing([{key, source_path} | rest], target_paths, copied_files)
       when key in [:prompt_path, :raw_log_path, :output_path, :meta_path] do
    target_path = Keyword.fetch!(target_paths, key)

    relative_path =
      Path.relative_to(target_path, Path.dirname(Keyword.fetch!(target_paths, :log_dir)))

    case File.cp(source_path, target_path) do
      :ok ->
        copy_existing(rest, target_paths, [relative_path | copied_files])

      {:error, :enoent} ->
        copy_existing(rest, target_paths, copied_files)

      {:error, reason} ->
        {:error, {:artifact_copy_failed, source_path, target_path, reason}}
    end
  end

  defp copy_existing([_entry | rest], target_paths, copied_files) do
    copy_existing(rest, target_paths, copied_files)
  end

  defp existing_files(paths) do
    root = Path.dirname(Keyword.fetch!(paths, :log_dir))

    paths
    |> Enum.flat_map(fn
      {key, path} when key in [:prompt_path, :raw_log_path, :output_path, :meta_path] ->
        if File.exists?(path) do
          [Path.relative_to(path, root)]
        else
          []
        end

      _entry ->
        []
    end)
    |> Enum.sort()
  end

  defp phase_status(kind, paths) do
    log_dir = Keyword.fetch!(paths, :log_dir)
    files = existing_files(paths)
    meta = read_json_file(Keyword.fetch!(paths, :meta_path))

    %{
      present?: files != [],
      path: log_dir,
      files: files,
      runtime: Map.get(meta, "runtime"),
      command: Map.get(meta, "command"),
      jsonl_lines: jsonl_line_count(kind, paths),
      codex_exec_runtime_command_path: codex_exec_runtime_command_path(paths, meta),
      codex_exec_text_mention_paths: codex_exec_text_mention_paths(paths)
    }
  end

  defp jsonl_line_count(:worker, paths), do: line_count(Keyword.fetch!(paths, :raw_log_path))
  defp jsonl_line_count(:review, paths), do: line_count(Keyword.fetch!(paths, :raw_log_path))

  defp line_count(path) do
    if File.exists?(path) do
      path
      |> File.stream!([], :line)
      |> Enum.count()
    end
  rescue
    _error -> nil
  end

  defp read_json_file(path) do
    with true <- File.exists?(path),
         {:ok, contents} <- File.read(path),
         {:ok, %{} = decoded} <- Jason.decode(contents) do
      decoded
    else
      _error -> %{}
    end
  end

  defp codex_exec_runtime_command_path(paths, meta) do
    command = Map.get(meta, "command")

    if codex_exec_command?(command) do
      root = Path.dirname(Keyword.fetch!(paths, :log_dir))
      meta_path = Keyword.fetch!(paths, :meta_path)
      Path.relative_to(meta_path, root)
    end
  end

  defp codex_exec_command?(command) when is_binary(command) do
    String.contains?(command, "codex exec")
  end

  defp codex_exec_command?(_command), do: false

  defp codex_exec_text_mention_paths(paths) do
    root = Path.dirname(Keyword.fetch!(paths, :log_dir))

    paths
    |> Enum.flat_map(fn
      {key, path} when key in [:prompt_path, :raw_log_path, :output_path] ->
        if codex_exec_in_file?(path) do
          [Path.relative_to(path, root)]
        else
          []
        end

      _entry ->
        []
    end)
    |> Enum.sort()
  end

  defp codex_exec_in_file?(path) do
    case File.read(path) do
      {:ok, contents} -> String.contains?(contents, "codex exec")
      _error -> false
    end
  end
end
