defmodule Symphony1.Project.RepoAdapter do
  require Logger

  @type fixed_command :: {String.t(), [String.t()]}
  @type command_runner :: (String.t(), [String.t()], keyword() -> {String.t(), non_neg_integer()})
  @proof_validation_scope "docs/live-proof-setup-run-merge.md"
  @proof_validation_command "test -f docs/live-proof-setup-run-merge.md"
  @proof_issue_label "Proof issue"
  @proof_branch_label "Branch"
  @setup_state_path ["config", "symphony_setup.state.json"]

  alias Symphony1.Core.{GitGateway, Idempotency}
  alias Symphony1.Observability.{EventLog, Recorder}
  alias Symphony1.Planning.{Graph, ScopeCheck}
  alias Symphony1.Project.{DependencySafety, SetupState}

  @spec bootstrap_commands() :: [fixed_command()]
  def bootstrap_commands do
    [
      {"git", ["status", "--short"]},
      {"mix", ["deps.get"]}
    ]
  end

  @spec validation_commands() :: [fixed_command()]
  def validation_commands do
    [
      {"mix", ["test"]}
    ]
  end

  @spec provenance_validation_commands(map()) :: [String.t()]
  def provenance_validation_commands(attrs) do
    case validation_commands_for(attrs) do
      {:ok, {:task, commands}} when is_list(commands) ->
        commands

      {:ok, {:default, commands}} when is_list(commands) ->
        Enum.map(commands, &fixed_command_to_string/1)

      {:error, _reason} ->
        []
    end
  end

  @spec finalize_workspace(map(), command_runner()) :: {:ok, map()} | {:error, term()}
  def finalize_workspace(attrs, runner \\ &System.cmd/3) do
    workspace = attrs.workspace

    with {:ok, issue_identifier} <- issue_identifier(attrs) do
      commit_message = "Implement #{issue_identifier}"

      Logger.info(
        "symphony.repo_adapter: finalize.start issue=#{issue_identifier} workspace=#{workspace}"
      )

      with {:ok, branch} <- current_branch(workspace, runner, attrs),
           attrs = Map.put(attrs, :branch, branch),
           :ok <- run_bootstrap_commands(workspace, runner, attrs, issue_identifier),
           :ok <- run_setup_commands(workspace, runner, attrs, issue_identifier),
           {:ok, changed_files} <- changed_files(workspace, runner, attrs),
           {:ok, finalization} <-
             finalize_changed_or_existing_workspace(
               attrs,
               branch,
               changed_files,
               commit_message,
               workspace,
               runner,
               issue_identifier
             ) do
        {:ok, finalization}
      end
    end
  end

  defp issue_identifier(%{issue_identifier: issue_identifier})
       when is_binary(issue_identifier) and issue_identifier != "" do
    {:ok, issue_identifier}
  end

  defp issue_identifier(%{issue: %{identifier: issue_identifier}})
       when is_binary(issue_identifier) and issue_identifier != "" do
    {:ok, issue_identifier}
  end

  defp issue_identifier(_attrs), do: {:error, :missing_issue_identifier}

  defp current_branch(workspace, runner, attrs) do
    case run_shared_git_read(runner, ["branch", "--show-current"], workspace, attrs) do
      {branch, 0} ->
        {:ok, branch}

      {output, exit_status} ->
        {:error, {:command_failed, "git", exit_status, output}}
    end
  end

  defp run_validation_commands(workspace, runner, attrs, issue_identifier) do
    with {:ok, {mode, commands}} <- validation_commands_for(attrs) do
      case mode do
        :task ->
          run_task_commands(commands, workspace, runner, issue_identifier, attrs)

        :default ->
          run_fixed_commands(commands, workspace, runner, issue_identifier, attrs)
      end
    end
  end

  defp run_setup_commands(workspace, runner, attrs, issue_identifier) do
    attrs
    |> task_setup_commands()
    |> run_task_commands(workspace, runner, issue_identifier, attrs)
  end

  defp task_setup_commands(%{task_context: %{validation: %{setup_commands: commands}}})
       when is_list(commands) do
    commands
  end

  defp task_setup_commands(_attrs), do: []

  defp task_validation_commands(%{task_context: %{validation: %{commands: commands}}})
       when is_list(commands) and commands != [] do
    commands
  end

  defp task_validation_commands(_attrs), do: nil

  defp validation_commands_for(attrs) do
    cond do
      commands = task_validation_commands(attrs) ->
        {:ok, {:task, commands}}

      proof_validation_fallback_allowed?(attrs) ->
        {:ok, {:task, [@proof_validation_command]}}

      Map.get(attrs, :project_type) == "product" ->
        {:error,
         {:missing_validation_commands,
          "product tasks must provide validation.commands unless explicitly proof-scoped"}}

      true ->
        {:ok, {:default, validation_commands()}}
    end
  end

  defp enforce_scope(_workspace, attrs, changed_files) do
    task_context = Map.get(attrs, :task_context)

    result = ScopeCheck.evaluate(task_context || fallback_task(), changed_files)

    case result.status do
      :pass -> {:ok, result}
      :warn -> {:ok, result}
      :fail -> {:error, {:scope_violation, result}}
    end
  end

  defp run_bootstrap_commands(workspace, runner, attrs, issue_identifier) do
    run_fixed_commands(bootstrap_commands(attrs), workspace, runner, issue_identifier, attrs)
  end

  defp bootstrap_commands(%{project_type: "product"}), do: [{"git", ["status", "--short"]}]
  defp bootstrap_commands(_attrs), do: bootstrap_commands()

  defp proof_validation_fallback_allowed?(attrs) do
    if Map.get(attrs, :project_type) == "product" do
      case Map.get(attrs, :task_context) do
        nil -> bootstrap_proof_issue?(attrs)
        %Graph.Task{} = task -> proof_scoped_task?(task)
        _other -> false
      end
    else
      false
    end
  end

  defp proof_scoped_task?(%Graph.Task{
         scope: %Graph.Scope{include: include, exclude: exclude}
       })
       when is_list(include) and is_list(exclude) do
    Enum.sort(Enum.uniq(include)) == [@proof_validation_scope] and exclude == []
  end

  defp proof_scoped_task?(_task), do: false

  defp bootstrap_proof_issue?(attrs) do
    current_issue_identifier(attrs) == bootstrap_proof_issue_identifier(attrs)
  end

  defp current_issue_identifier(%{issue_identifier: issue_identifier})
       when is_binary(issue_identifier) and issue_identifier != "" do
    issue_identifier
  end

  defp current_issue_identifier(%{issue: %{identifier: issue_identifier}})
       when is_binary(issue_identifier) and issue_identifier != "" do
    issue_identifier
  end

  defp current_issue_identifier(_attrs), do: nil

  defp bootstrap_proof_issue_identifier(attrs) do
    attrs
    |> setup_state_roots()
    |> Enum.find_value(fn root ->
      root
      |> load_setup_state()
      |> get_in(["proof_issue", "identifier"])
    end)
  end

  defp setup_state_roots(attrs) do
    [
      Map.get(attrs, :source_repo),
      Map.get(attrs, :observability_root),
      Map.get(attrs, :workspace)
    ]
    |> Enum.filter(&(is_binary(&1) and &1 != ""))
    |> Enum.uniq()
  end

  defp load_setup_state(root) when is_binary(root) and root != "" do
    root
    |> then(&Path.join([&1 | @setup_state_path]))
    |> SetupState.read()
    |> case do
      {:ok, state} -> state
      {:error, _reason} -> %{}
    end
  end

  defp load_setup_state(_workspace), do: %{}

  defp run_fixed_commands(commands, workspace, runner, issue_identifier, attrs) do
    Enum.reduce_while(commands, :ok, fn {command, args}, :ok ->
      case run_logged_command(
             runner,
             command,
             args,
             workspace,
             issue_identifier,
             "finalize.command",
             attrs
           ) do
        {:ok, _output} ->
          {:cont, :ok}

        {:error, exit_status, output} ->
          {:halt, {:error, {:command_failed, command, exit_status, output}}}
      end
    end)
  end

  defp run_task_commands(commands, workspace, runner, issue_identifier, attrs) do
    with {:ok, parsed_commands} <- parse_task_commands(commands) do
      Enum.reduce_while(parsed_commands, :ok, fn {_command_string, command, args}, :ok ->
        case run_logged_command(
               runner,
               command,
               args,
               workspace,
               issue_identifier,
               "finalize.command",
               attrs
             ) do
          {:ok, _output} ->
            {:cont, :ok}

          {:error, exit_status, output} ->
            {:halt, {:error, {:command_failed, command, exit_status, output}}}
        end
      end)
    end
  end

  defp parse_task_commands(commands) do
    Enum.reduce_while(commands, {:ok, []}, fn command_string, {:ok, acc} ->
      case Graph.parse_task_command(command_string) do
        {:ok, {command, args}} ->
          {:cont, {:ok, [{command_string, command, args} | acc]}}

        {:error, {:invalid_task_command, _command, _reason} = reason} ->
          {:halt, {:error, reason}}
      end
    end)
    |> case do
      {:ok, parsed_commands} -> {:ok, Enum.reverse(parsed_commands)}
      error -> error
    end
  end

  defp fixed_command_to_string({command, args}) when is_binary(command) and is_list(args) do
    Enum.join([command | args], " ")
  end

  defp finalize_changed_or_existing_workspace(
         attrs,
         branch,
         [],
         commit_message,
         workspace,
         runner,
         issue_identifier
       ) do
    if Map.get(attrs, :reuse_pull_request, false) or git_push_replay_enabled?(attrs) do
      with {:ok, local_head_sha} <- local_head_sha(workspace, runner, attrs),
           :ok <- run_validation_commands(workspace, runner, attrs, issue_identifier),
           :ok <- validate_proof_artifact_facts(workspace, attrs, issue_identifier, branch) do
        case replay_finalized_workspace_if_pushed(
               attrs,
               branch,
               commit_message,
               workspace,
               issue_identifier,
               local_head_sha
             ) do
          {:ok, replayed_finalization} ->
            {:ok, replayed_finalization}

          {:error, :no_replayed_push} ->
            if Map.get(attrs, :reuse_pull_request, false) do
              with :ok <- run_dependency_safety(workspace, runner, attrs, issue_identifier),
                   {:ok, committed_files} <-
                     committed_files_since_upstream(workspace, runner, attrs),
                   {:ok, scope_check} <- enforce_scope(workspace, attrs, committed_files),
                   {:ok, pushed_existing_commits?} <-
                     push_existing_commits_if_needed(
                       workspace,
                       runner,
                       branch,
                       issue_identifier,
                       attrs,
                       local_head_sha
                     ) do
                {:ok,
                 %{
                   branch: branch,
                   commit_message: commit_message,
                   issue_identifier: issue_identifier,
                   local_head_sha: local_head_sha,
                   pushed_existing_commits: pushed_existing_commits?,
                   reused_existing_changes: true,
                   scope_check: scope_check,
                   workspace: workspace
                 }}
              end
            else
              {:error, :no_changes}
            end

          {:error, reason} ->
            {:error, reason}
        end
      end
    else
      {:error, :no_changes}
    end
  end

  defp finalize_changed_or_existing_workspace(
         attrs,
         branch,
         changed_files,
         commit_message,
         workspace,
         runner,
         issue_identifier
       ) do
    with :ok <- ensure_working_tree_changes(changed_files),
         :ok <- run_validation_commands(workspace, runner, attrs, issue_identifier),
         :ok <- validate_proof_artifact_facts(workspace, attrs, issue_identifier, branch),
         :ok <- run_dependency_safety(workspace, runner, attrs, issue_identifier),
         {:ok, changed_files} <- changed_files(workspace, runner, attrs),
         {:ok, scope_check} <- enforce_scope(workspace, attrs, changed_files),
         :ok <- stage_changed_files(workspace, runner, changed_files, issue_identifier, attrs),
         :ok <- ensure_staged_changes(workspace, runner, attrs),
         :ok <-
           run_command(
             runner,
             "git",
             ["commit", "-m", commit_message],
             workspace,
             issue_identifier,
             attrs
           ),
         {:ok, local_head_sha} <- local_head_sha(workspace, runner, attrs),
         :ok <- push_branch(workspace, runner, branch, issue_identifier, attrs, local_head_sha) do
      {:ok,
       %{
         branch: branch,
         commit_message: commit_message,
         issue_identifier: issue_identifier,
         local_head_sha: local_head_sha,
         scope_check: scope_check,
         workspace: workspace
       }}
    end
  end

  defp ensure_staged_changes(workspace, runner, attrs) do
    case run_shared_git_read(runner, ["diff", "--cached", "--quiet"], workspace, attrs) do
      {_output, 0} ->
        {:error, :no_changes}

      {_output, 1} ->
        :ok

      {output, exit_status} ->
        {:error, {:command_failed, "git", exit_status, output}}
    end
  end

  defp ensure_working_tree_changes([]), do: {:error, :no_changes}
  defp ensure_working_tree_changes(_changed_files), do: :ok

  defp validate_proof_artifact_facts(workspace, attrs, issue_identifier, branch) do
    if proof_validation_fallback_allowed?(attrs) do
      proof_path = Path.join(workspace, @proof_validation_scope)

      case File.read(proof_path) do
        {:ok, contents} ->
          case proof_artifact_mismatch_details(contents, issue_identifier, branch) do
            nil ->
              :ok

            details ->
              {:error,
               {:proof_artifact_facts_invalid, Map.put(details, :path, @proof_validation_scope)}}
          end

        {:error, reason} ->
          {:error, {:proof_artifact_read_failed, @proof_validation_scope, reason}}
      end
    else
      :ok
    end
  end

  defp proof_artifact_mismatch_details(contents, issue_identifier, branch) do
    issue_line = proof_artifact_fact_line(contents, @proof_issue_label)
    branch_line = proof_artifact_fact_line(contents, @proof_branch_label)

    issue_mismatch? = fact_line_value(issue_line) != issue_identifier
    branch_mismatch? = fact_line_value(branch_line) != branch

    if issue_mismatch? or branch_mismatch? do
      %{
        expected_issue_identifier: issue_identifier,
        expected_branch: branch,
        actual_issue_line: fact_line_text(issue_line, @proof_issue_label),
        actual_branch_line: fact_line_text(branch_line, @proof_branch_label)
      }
    end
  end

  defp proof_artifact_fact_line(contents, label) do
    regex = ~r/^\s*(?:[-*]\s+)?#{Regex.escape(label)}:\s*(.+?)\s*$/m

    case Regex.run(regex, contents, capture: :all_but_first) do
      [value] ->
        trimmed_value = String.trim(value)
        %{label: label, line: "#{label}: #{trimmed_value}", value: trimmed_value}

      _other ->
        nil
    end
  end

  defp fact_line_value(%{value: value}), do: value
  defp fact_line_value(_line), do: nil

  defp fact_line_text(%{line: line}, _label), do: line
  defp fact_line_text(_line, label), do: "#{label}: [missing]"

  defp run_dependency_safety(workspace, runner, attrs, issue_identifier) do
    with {:ok, %{changed: changed?}} <- DependencySafety.run(workspace, runner, issue_identifier) do
      if changed? do
        run_validation_commands(workspace, runner, attrs, issue_identifier)
      else
        :ok
      end
    end
  end

  defp run_command(runner, command, args, workspace, issue_identifier, attrs) do
    case run_logged_command(
           runner,
           command,
           args,
           workspace,
           issue_identifier,
           "finalize.command",
           attrs
         ) do
      {:ok, _output} -> :ok
      {:error, exit_status, output} -> {:error, {:command_failed, command, exit_status, output}}
    end
  end

  defp stage_changed_files(workspace, runner, changed_files, issue_identifier, attrs) do
    run_command(
      runner,
      "git",
      ["add", "-A", "--" | changed_files],
      workspace,
      issue_identifier,
      attrs
    )
  end

  defp run_logged_command(runner, command, args, workspace, issue_identifier, stage, attrs) do
    command_string = Enum.join([command | args], " ")
    started_at = System.monotonic_time(:millisecond)

    Logger.info(
      "symphony.repo_adapter: #{stage} start issue=#{issue_identifier} cmd=#{inspect(command_string)} cwd=#{workspace}"
    )

    {output, exit_status} =
      maybe_run_shared_git_read(command, args, workspace, attrs, fn ->
        runner.(command, args, cd: workspace, stderr_to_stdout: true)
      end)

    elapsed_ms = System.monotonic_time(:millisecond) - started_at
    trimmed_output = String.trim(output)
    output_tail = output_tail(trimmed_output)
    sanitized_output_tail = EventLog.sanitize_value(output_tail)

    log_level = if exit_status == 0, do: :info, else: :warning

    record_command_event(
      attrs,
      issue_identifier,
      workspace,
      command_string,
      stage,
      exit_status,
      elapsed_ms,
      output,
      output_tail
    )

    Logger.log(
      log_level,
      "symphony.repo_adapter: #{stage} finish issue=#{issue_identifier} cmd=#{inspect(command_string)} exit=#{exit_status} elapsed_ms=#{elapsed_ms} output=#{inspect(sanitized_output_tail)}"
    )

    if exit_status == 0 do
      {:ok, trimmed_output}
    else
      {:error, exit_status, trimmed_output}
    end
  end

  defp changed_files(workspace, runner, attrs) do
    case run_shared_git_read(
           runner,
           ["status", "--porcelain", "--untracked-files=all"],
           workspace,
           attrs
         ) do
      {output, 0} ->
        {:ok, parse_changed_files(output)}

      {output, exit_status} ->
        {:error, {:command_failed, "git", exit_status, output}}
    end
  end

  defp committed_files_since_upstream(workspace, runner, attrs) do
    case run_shared_git_read(runner, ["diff", "--name-only", "@{u}..HEAD"], workspace, attrs) do
      {output, 0} ->
        {:ok, parse_committed_files(output)}

      {output, _exit_status} ->
        if upstream_missing?(output) do
          {:ok, []}
        else
          {:error, {:command_failed, "git", 1, output}}
        end
    end
  end

  defp parse_committed_files(output) do
    output
    |> String.split("\n", trim: true)
    |> Enum.reject(&internal_diagnostic_path?/1)
  end

  defp push_existing_commits_if_needed(
         workspace,
         runner,
         branch,
         issue_identifier,
         attrs,
         local_head_sha
       ) do
    case run_shared_git_read(runner, ["rev-list", "--count", "@{u}..HEAD"], workspace, attrs) do
      {output, 0} ->
        with {:ok, ahead_count} <- parse_ahead_count(output) do
          if ahead_count > 0 do
            with :ok <-
                   push_branch(
                     workspace,
                     runner,
                     branch,
                     issue_identifier,
                     attrs,
                     local_head_sha
                   ) do
              {:ok, true}
            end
          else
            {:ok, false}
          end
        end

      {output, _exit_status} ->
        if upstream_missing?(output) do
          {:ok, false}
        else
          {:error, {:command_failed, "git", 1, output}}
        end
    end
  end

  defp parse_ahead_count(output) do
    case Integer.parse(output) do
      {ahead_count, ""} ->
        {:ok, ahead_count}

      _other ->
        {:error, {:command_failed, "git", 1, "invalid rev-list ahead count: #{output}"}}
    end
  end

  defp run_unlogged_git_command(runner, args, workspace) do
    {output, exit_status} = runner.("git", args, cd: workspace, stderr_to_stdout: true)
    {String.trim_trailing(output), exit_status}
  end

  defp local_head_sha(workspace, runner, attrs) do
    case run_shared_git_read(runner, ["rev-parse", "HEAD"], workspace, attrs) do
      {sha, 0} ->
        {:ok, sha}

      {output, exit_status} ->
        {:error, {:command_failed, "git", exit_status, output}}
    end
  end

  defp run_shared_git_read(runner, args, workspace, attrs) do
    git_gateway = Map.get(attrs, :git_gateway, &GitGateway.run/2)

    git_gateway.(shared_git_repo_root(attrs, workspace), fn ->
      run_unlogged_git_command(runner, args, workspace)
    end)
  end

  defp maybe_run_shared_git_read("git", args, workspace, attrs, operation) do
    if git_read_command?(args) do
      git_gateway = Map.get(attrs, :git_gateway, &GitGateway.run/2)
      git_gateway.(shared_git_repo_root(attrs, workspace), operation)
    else
      operation.()
    end
  end

  defp maybe_run_shared_git_read(_command, _args, _workspace, _attrs, operation), do: operation.()

  defp shared_git_repo_root(attrs, workspace) do
    attrs
    |> Map.get(:source_repo, workspace)
    |> Path.expand()
  end

  defp git_read_command?(["branch" | _rest]), do: true
  defp git_read_command?(["diff" | _rest]), do: true
  defp git_read_command?(["rev-parse" | _rest]), do: true
  defp git_read_command?(["rev-list" | _rest]), do: true
  defp git_read_command?(["status" | _rest]), do: true
  defp git_read_command?(_args), do: false

  defp push_branch(workspace, runner, branch, issue_identifier, attrs, local_head_sha) do
    case git_push_idempotency_spec(attrs, branch, local_head_sha) do
      nil ->
        run_command(
          runner,
          "git",
          ["push", "-u", "origin", branch],
          workspace,
          issue_identifier,
          attrs
        )

      spec ->
        case Idempotency.run(spec, fn ->
               case run_command(
                      runner,
                      "git",
                      ["push", "-u", "origin", branch],
                      workspace,
                      issue_identifier,
                      attrs
                    ) do
                 :ok ->
                   {:ok, %{branch: branch, local_head_sha: local_head_sha, pushed: true}}

                 {:error, reason} ->
                   {:error, reason}
               end
             end) do
          {:ok, _result, _mode} -> :ok
          {:error, reason} -> {:error, reason}
        end
    end
  end

  defp replay_finalized_workspace_if_pushed(
         attrs,
         branch,
         commit_message,
         workspace,
         issue_identifier,
         local_head_sha
       ) do
    case git_push_idempotency_spec(attrs, branch, local_head_sha) do
      nil ->
        {:error, :no_replayed_push}

      spec ->
        case Idempotency.replay(spec) do
          {:ok, _push_result} ->
            {:ok,
             %{
               branch: branch,
               commit_message: commit_message,
               issue_identifier: issue_identifier,
               local_head_sha: local_head_sha,
               replayed_existing_push: true,
               workspace: workspace
             }}

          :none ->
            {:error, :no_replayed_push}

          {:error, reason} ->
            {:error, reason}
        end
    end
  end

  defp git_push_idempotency_spec(attrs, branch, local_head_sha) do
    case observability_root(attrs, Map.get(attrs, :workspace)) do
      nil ->
        nil

      root ->
        %{
          root: root,
          scope: "git.push_issue_branch",
          key:
            [
              graph_task_id(attrs),
              current_issue_identifier(attrs),
              branch
            ]
            |> Enum.reject(&is_nil/1)
            |> Enum.join(":"),
          fingerprint: %{
            "branch" => branch,
            "base_branch" => Map.get(attrs, :base_branch),
            "local_head_sha" => local_head_sha
          },
          decode_result: &Idempotency.restore_keys/1,
          after_record: Map.get(attrs, :idempotency_after_git_push_record)
        }
    end
  end

  defp git_push_replay_enabled?(attrs) do
    not is_nil(observability_root(attrs, Map.get(attrs, :workspace)))
  end

  defp upstream_missing?(output) when is_binary(output) do
    output =~ "no upstream configured" or output =~ "no upstream" or
      output =~ "unknown revision or path not in the working tree"
  end

  defp parse_changed_files(output) do
    output
    |> String.split("\n", trim: true)
    |> Enum.map(&parse_changed_file/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.reject(&internal_diagnostic_path?/1)
  end

  defp parse_changed_file(<<"?? ", path::binary>>), do: path

  defp parse_changed_file(line) do
    path = String.slice(line, 3..-1//1)

    case String.split(path, " -> ") do
      [_old, new] -> new
      [single] -> single
    end
  end

  defp internal_diagnostic_path?(".symphony"), do: true
  defp internal_diagnostic_path?(".symphony/"), do: true
  defp internal_diagnostic_path?("tmp/symphony"), do: true
  defp internal_diagnostic_path?("tmp/symphony/"), do: true

  defp internal_diagnostic_path?(path) do
    String.starts_with?(path, ".symphony/") or
      String.starts_with?(path, "tmp/symphony/")
  end

  defp record_command_event(
         attrs,
         issue_identifier,
         workspace,
         command_string,
         stage,
         exit_status,
         elapsed_ms,
         output,
         output_tail
       ) do
    case observability_root(attrs, workspace) do
      nil ->
        :ok

      root ->
        Recorder.record(root, "finalization_command_completed",
          issue_identifier: issue_identifier,
          graph_task_id: graph_task_id(attrs),
          phase: "finalization",
          severity: if(exit_status == 0, do: "info", else: "warning"),
          details: %{
            workspace_path: workspace,
            branch: Map.get(attrs, :branch),
            base_branch: Map.get(attrs, :base_branch),
            stage: stage,
            command: command_string,
            exit_status: exit_status,
            elapsed_ms: elapsed_ms,
            output_bytes: byte_size(output),
            output_tail: output_tail,
            failure_reason:
              if(exit_status == 0,
                do: nil,
                else: "command_failed: #{command_string} (exit #{exit_status})"
              )
          }
        )
    end
  end

  defp observability_root(attrs, _workspace) do
    Map.get(attrs, :observability_root) || Map.get(attrs, :source_repo)
  end

  defp graph_task_id(%{task_context: %Symphony1.Planning.Graph.Task{id: id}}), do: id
  defp graph_task_id(_attrs), do: nil

  defp output_tail(output) when is_binary(output) do
    output
    |> String.slice(-2_000, 2_000)
    |> to_string()
  end

  defp fallback_task do
    %Symphony1.Planning.Graph.Task{
      id: "unknown",
      title: "unknown",
      description: "",
      acceptance_criteria: [],
      dependencies: [],
      status: "pending",
      materialization: %Symphony1.Planning.Graph.Materialization{}
    }
  end
end
