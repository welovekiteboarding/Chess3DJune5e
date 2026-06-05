defmodule Symphony1.Core.GitHub do
  require Logger

  alias Symphony1.Core.GitGateway
  alias Symphony1.Core.Idempotency
  alias Symphony1.Observability.EventLog
  alias Symphony1.Observability.Recorder

  @default_command_timeout_ms 30_000
  @gh_command_env [
    {"GH_PROMPT_DISABLED", "1"},
    {"GIT_TERMINAL_PROMPT", "0"},
    {"GCM_INTERACTIVE", "never"}
  ]
  @git_command_env [
    {"GIT_TERMINAL_PROMPT", "0"},
    {"GCM_INTERACTIVE", "never"}
  ]

  @type command_runner :: (String.t(), [String.t()], keyword() -> {String.t(), non_neg_integer()})

  @spec find_pull_request_by_branch(map(), command_runner()) ::
          {:ok, map()} | :none | {:error, term()}
  def find_pull_request_by_branch(attrs, runner \\ &System.cmd/3) do
    args =
      [
        "pr",
        "list"
      ] ++
        repo_args(attrs) ++
        [
          "--head",
          attrs.branch,
          "--state",
          Map.get(attrs, :state, "open"),
          "--json",
          "url,title,state,headRefName,baseRefName"
        ]

    case run_command("gh", args, attrs.cwd, attrs, runner) do
      {:ok, {output, 0}} ->
        output
        |> Jason.decode()
        |> decode_pull_request(attrs)

      {:ok, {output, exit_status}} ->
        {:error, {:command_failed, "gh", exit_status, String.trim(output)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec reopen_pull_request(map(), command_runner()) :: {:ok, map()} | {:error, term()}
  def reopen_pull_request(%{url: url} = pull_request, runner \\ &System.cmd/3) do
    args = ["pr", "reopen", url]
    started_at = System.monotonic_time(:millisecond)

    record_issue_event(pull_request, "pull_request_reopen_started", "github",
      workspace_path: pull_request.cwd,
      branch: Map.get(pull_request, :branch),
      base_branch: Map.get(pull_request, :base_branch),
      pull_request_url: pull_request.url
    )

    case run_command("gh", args, pull_request.cwd, pull_request, runner) do
      {:ok, {_output, 0}} ->
        elapsed_ms = System.monotonic_time(:millisecond) - started_at
        reopened_pull_request = %{pull_request | status: :open}

        record_issue_event(reopened_pull_request, "pull_request_reopened", "github",
          workspace_path: reopened_pull_request.cwd,
          branch: Map.get(reopened_pull_request, :branch),
          base_branch: Map.get(reopened_pull_request, :base_branch),
          pull_request_url: reopened_pull_request.url,
          elapsed_ms: elapsed_ms
        )

        {:ok, reopened_pull_request}

      {:ok, {output, exit_status}} ->
        elapsed_ms = System.monotonic_time(:millisecond) - started_at

        record_issue_event(pull_request, "pull_request_reopen_failed", "github",
          workspace_path: pull_request.cwd,
          branch: Map.get(pull_request, :branch),
          base_branch: Map.get(pull_request, :base_branch),
          pull_request_url: pull_request.url,
          elapsed_ms: elapsed_ms,
          failure_reason:
            format_command_error({:command_failed, "gh", exit_status, String.trim(output)})
        )

        {:error, {:command_failed, "gh", exit_status, String.trim(output)}}

      {:error, reason} ->
        elapsed_ms = System.monotonic_time(:millisecond) - started_at

        record_issue_event(pull_request, "pull_request_reopen_failed", "github",
          workspace_path: pull_request.cwd,
          branch: Map.get(pull_request, :branch),
          base_branch: Map.get(pull_request, :base_branch),
          pull_request_url: pull_request.url,
          elapsed_ms: elapsed_ms,
          failure_reason: format_command_error(reason)
        )

        {:error, reason}
    end
  end

  @spec pull_request_checks(map(), command_runner()) ::
          {:ok, :passing | {:blocked, list()}} | {:error, term()}
  def pull_request_checks(pull_request, runner \\ &System.cmd/3)

  def pull_request_checks(%{status: :merged}, _runner), do: {:ok, :passing}

  def pull_request_checks(%{url: url} = pull_request, runner) do
    args =
      [
        "pr",
        "checks",
        url,
        "--json",
        "name,state,bucket"
      ] ++ repo_args(pull_request)

    case run_command("gh", args, pull_request.cwd, pull_request, runner) do
      {:ok, {output, exit_status}} when exit_status in [0, 1, 8] ->
        decode_pull_request_checks(output)

      {:ok, {output, exit_status}} ->
        {:error, {:command_failed, "gh", exit_status, String.trim(output)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec build_pull_request_body(map()) :: String.t()
  def build_pull_request_body(attrs) do
    base_body =
      attrs
      |> Map.get(:body, "")
      |> to_string()
      |> String.trim_trailing()

    provenance_block = build_provenance_block(attrs)

    cond do
      base_body == "" and provenance_block == nil ->
        ""

      base_body == "" ->
        provenance_block

      provenance_block == nil ->
        base_body

      true ->
        base_body <> "\n\n" <> provenance_block
    end
  end

  @spec open_pull_request(map(), command_runner()) :: {:ok, map()} | {:error, term()}
  def open_pull_request(attrs, runner \\ &System.cmd/3) do
    attrs = Map.put(attrs, :body, build_pull_request_body(attrs))

    args = [
      "pr",
      "create",
      "--base",
      attrs.base_branch,
      "--head",
      attrs.branch,
      "--title",
      attrs.title,
      "--body",
      attrs.body
    ]

    started_at = System.monotonic_time(:millisecond)

    Logger.info(
      "symphony.github: pr_create start issue=#{issue_identifier(attrs)} repo=#{inspect(attrs.repo)} branch=#{attrs.branch} base=#{attrs.base_branch} cwd=#{attrs.cwd}"
    )

    record_issue_event(attrs, "pull_request_create_started", "github",
      workspace_path: attrs.cwd,
      branch: attrs.branch,
      base_branch: attrs.base_branch
    )

    case pull_request_create_idempotency_spec(attrs) do
      nil ->
        handle_pull_request_create_result(
          do_open_pull_request(attrs, args, runner),
          attrs,
          started_at
        )

      spec ->
        case Idempotency.run(spec, fn -> do_open_pull_request(attrs, args, runner) end) do
          {:ok, pull_request, :fresh} ->
            elapsed_ms = System.monotonic_time(:millisecond) - started_at

            record_issue_event(attrs, "pull_request_created", "github",
              workspace_path: attrs.cwd,
              branch: attrs.branch,
              base_branch: attrs.base_branch,
              pull_request_url: pull_request.url,
              elapsed_ms: elapsed_ms
            )

            {:ok, pull_request}

          {:ok, pull_request, :replayed} ->
            elapsed_ms = System.monotonic_time(:millisecond) - started_at

            record_issue_event(attrs, "pull_request_create_replayed", "github",
              workspace_path: attrs.cwd,
              branch: attrs.branch,
              base_branch: attrs.base_branch,
              pull_request_url: pull_request.url,
              elapsed_ms: elapsed_ms
            )

            {:ok, pull_request}

          {:error, reason} ->
            handle_pull_request_create_result({:error, reason}, attrs, started_at)
        end
    end
  end

  @spec merge_pull_request(map(), command_runner()) :: {:ok, map()} | {:error, term()}
  def merge_pull_request(pull_request, runner \\ &System.cmd/3)

  def merge_pull_request(%{status: :open} = pull_request, runner) do
    started_at = System.monotonic_time(:millisecond)

    record_issue_event(pull_request, "pull_request_merge_started", "github",
      workspace_path: pull_request.cwd,
      branch: Map.get(pull_request, :branch),
      base_branch: Map.get(pull_request, :base_branch),
      pull_request_url: pull_request.url
    )

    with {:ok, merge_flag} <- merge_flag(pull_request) do
      args = ["pr", "merge", pull_request.url, merge_flag]

      case pull_request_merge_idempotency_spec(pull_request) do
        nil ->
          handle_pull_request_merge_result(
            do_merge_pull_request(pull_request, args, runner),
            pull_request,
            started_at
          )

        spec ->
          case Idempotency.run(spec, fn -> do_merge_pull_request(pull_request, args, runner) end) do
            {:ok, merged_pull_request, :fresh} ->
              elapsed_ms = System.monotonic_time(:millisecond) - started_at

              record_issue_event(merged_pull_request, "pull_request_merged", "github",
                workspace_path: merged_pull_request.cwd,
                branch: Map.get(merged_pull_request, :branch),
                base_branch: Map.get(merged_pull_request, :base_branch),
                pull_request_url: merged_pull_request.url,
                elapsed_ms: elapsed_ms
              )

              {:ok, merged_pull_request}

            {:ok, merged_pull_request, :replayed} ->
              elapsed_ms = System.monotonic_time(:millisecond) - started_at

              record_issue_event(merged_pull_request, "pull_request_merge_replayed", "github",
                workspace_path: merged_pull_request.cwd,
                branch: Map.get(merged_pull_request, :branch),
                base_branch: Map.get(merged_pull_request, :base_branch),
                pull_request_url: merged_pull_request.url,
                elapsed_ms: elapsed_ms
              )

              {:ok, merged_pull_request}

            {:error, reason} ->
              handle_pull_request_merge_result({:error, reason}, pull_request, started_at)
          end
      end
    else
      {:error, reason} ->
        record_issue_event(pull_request, "pull_request_merge_failed", "github",
          workspace_path: pull_request.cwd,
          branch: Map.get(pull_request, :branch),
          base_branch: Map.get(pull_request, :base_branch),
          pull_request_url: pull_request.url,
          failure_reason: format_merge_strategy_failure(reason)
        )

        {:error, reason}
    end
  end

  def merge_pull_request(pull_request, _runner) do
    record_issue_event(pull_request, "pull_request_merge_failed", "github",
      workspace_path: Map.get(pull_request, :cwd),
      branch: Map.get(pull_request, :branch),
      base_branch: Map.get(pull_request, :base_branch),
      pull_request_url: Map.get(pull_request, :url),
      failure_reason: "invalid_pull_request_status: #{inspect(pull_request.status)}"
    )

    {:error, {:invalid_pull_request_status, pull_request.status}}
  end

  defp handle_pull_request_create_result({:ok, pull_request}, attrs, started_at) do
    elapsed_ms = System.monotonic_time(:millisecond) - started_at

    record_issue_event(attrs, "pull_request_created", "github",
      workspace_path: attrs.cwd,
      branch: attrs.branch,
      base_branch: attrs.base_branch,
      pull_request_url: pull_request.url,
      elapsed_ms: elapsed_ms
    )

    {:ok, pull_request}
  end

  defp handle_pull_request_create_result({:error, reason}, attrs, started_at) do
    elapsed_ms = System.monotonic_time(:millisecond) - started_at
    sanitized_reason = sanitized_inspect(reason)

    Logger.warning(
      "symphony.github: pr_create finish issue=#{issue_identifier(attrs)} repo=#{inspect(attrs.repo)} branch=#{attrs.branch} exit=1 elapsed_ms=#{elapsed_ms} output=#{inspect(sanitized_reason)}"
    )

    record_issue_event(attrs, "pull_request_create_failed", "github",
      workspace_path: attrs.cwd,
      branch: attrs.branch,
      base_branch: attrs.base_branch,
      elapsed_ms: elapsed_ms,
      failure_reason: format_command_error(reason)
    )

    {:error, reason}
  end

  defp handle_pull_request_merge_result({:ok, merged_pull_request}, _pull_request, started_at) do
    elapsed_ms = System.monotonic_time(:millisecond) - started_at

    record_issue_event(merged_pull_request, "pull_request_merged", "github",
      workspace_path: merged_pull_request.cwd,
      branch: Map.get(merged_pull_request, :branch),
      base_branch: Map.get(merged_pull_request, :base_branch),
      pull_request_url: merged_pull_request.url,
      elapsed_ms: elapsed_ms
    )

    {:ok, merged_pull_request}
  end

  defp handle_pull_request_merge_result({:error, reason}, pull_request, started_at) do
    elapsed_ms = System.monotonic_time(:millisecond) - started_at

    record_issue_event(pull_request, "pull_request_merge_failed", "github",
      workspace_path: pull_request.cwd,
      branch: Map.get(pull_request, :branch),
      base_branch: Map.get(pull_request, :base_branch),
      pull_request_url: pull_request.url,
      elapsed_ms: elapsed_ms,
      failure_reason: format_command_error(reason)
    )

    {:error, reason}
  end

  defp build_provenance_block(attrs) do
    lines =
      [
        "## Symphony Provenance",
        maybe_detail_line("Linear issue", Map.get(attrs, :issue_identifier)),
        maybe_detail_line("Graph task", Map.get(attrs, :graph_task_id)),
        maybe_detail_line("Branch", Map.get(attrs, :branch)),
        maybe_detail_line("Base branch", Map.get(attrs, :base_branch))
      ] ++ maybe_artifact_lines(attrs) ++ maybe_validation_lines(attrs)

    case Enum.reject(lines, &is_nil/1) do
      ["## Symphony Provenance"] -> nil
      filtered_lines -> Enum.join(filtered_lines, "\n")
    end
  end

  defp maybe_detail_line(_label, nil), do: nil
  defp maybe_detail_line(_label, ""), do: nil
  defp maybe_detail_line(label, value), do: "- #{label}: `#{value}`"

  defp maybe_artifact_lines(attrs) do
    case Map.get(attrs, :issue_identifier) do
      issue_identifier when is_binary(issue_identifier) and issue_identifier != "" ->
        [
          "- Recorder artifacts:",
          "- `tmp/symphony/runs/#{issue_identifier}/summary.json`",
          "- `tmp/symphony/runs/#{issue_identifier}/events.jsonl`"
        ]

      _other ->
        []
    end
  end

  defp maybe_validation_lines(attrs) do
    case Map.get(attrs, :validation_commands, []) do
      commands when is_list(commands) and commands != [] ->
        ["- Validation commands:" | Enum.map(commands, &"- `#{&1}`")]

      _other ->
        []
    end
  end

  defp record_issue_event(attrs, event, phase, details) do
    case observability_root(attrs) do
      nil ->
        :ok

      root ->
        Recorder.record(root, event,
          issue_identifier: issue_identifier(attrs),
          graph_task_id: Map.get(attrs, :graph_task_id),
          phase: phase,
          severity: severity_for_event(event),
          details: details
        )
    end
  end

  defp observability_root(attrs) do
    Map.get(attrs, :observability_root) || Map.get(attrs, :repo_root)
  end

  defp severity_for_event(event) do
    if String.ends_with?(event, "_failed"), do: "warning", else: "info"
  end

  defp format_merge_strategy_failure({:invalid_merge_strategy, strategy}) do
    "invalid_merge_strategy: #{inspect(strategy)}"
  end

  defp format_merge_strategy_failure(reason), do: inspect(reason)

  defp do_open_pull_request(attrs, args, runner) do
    case run_command("gh", args, attrs.cwd, attrs, runner) do
      {:ok, {output, 0}} ->
        sanitized_output = sanitized_output(output)

        Logger.info(
          "symphony.github: pr_create finish issue=#{issue_identifier(attrs)} repo=#{inspect(attrs.repo)} branch=#{attrs.branch} exit=0 output=#{inspect(sanitized_output)}"
        )

        {:ok,
         %{
           base_branch: attrs.base_branch,
           body: attrs.body,
           branch: attrs.branch,
           cwd: attrs.cwd,
           repo: attrs.repo,
           status: :open,
           title: attrs.title,
           url: String.trim(output)
         }}

      {:ok, {output, exit_status}} ->
        {:error, {:command_failed, "gh", exit_status, String.trim(output)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp do_merge_pull_request(pull_request, args, runner) do
    case run_command("gh", args, pull_request.cwd, pull_request, runner) do
      {:ok, {_output, 0}} ->
        {:ok, %{pull_request | status: :merged}}

      {:ok, {output, exit_status}} ->
        {:error, {:command_failed, "gh", exit_status, String.trim(output)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp pull_request_create_idempotency_spec(attrs) do
    case idempotency_root(attrs) do
      nil ->
        nil

      root ->
        %{
          root: root,
          scope: "github.pull_request_create",
          key:
            [
              Map.get(attrs, :graph_task_id),
              Map.get(attrs, :issue_identifier),
              Map.get(attrs, :branch),
              Map.get(attrs, :base_branch)
            ]
            |> Enum.reject(&is_nil/1)
            |> Enum.join(":"),
          fingerprint: %{
            "repo" => attrs.repo,
            "branch" => attrs.branch,
            "base_branch" => attrs.base_branch,
            "title" => attrs.title,
            "body" => attrs.body,
            "local_head_sha" => Map.get(attrs, :local_head_sha)
          },
          encode_result: &encode_pull_request_result/1,
          decode_result: &Idempotency.restore_keys/1,
          after_record: Map.get(attrs, :idempotency_after_pull_request_create_record)
        }
    end
  end

  defp pull_request_merge_idempotency_spec(pull_request) do
    case idempotency_root(pull_request) do
      nil ->
        nil

      root ->
        %{
          root: root,
          scope: "github.pull_request_merge",
          key: Map.fetch!(pull_request, :url),
          fingerprint: %{
            "pull_request_url" => pull_request.url,
            "merge_strategy" => Map.get(pull_request, :merge_strategy, "merge")
          },
          encode_result: &encode_pull_request_result/1,
          decode_result: &Idempotency.restore_keys/1,
          after_record: Map.get(pull_request, :idempotency_after_pull_request_merge_record)
        }
    end
  end

  defp encode_pull_request_result(pull_request) when is_map(pull_request) do
    Map.take(pull_request, [
      :base_branch,
      :body,
      :branch,
      :cwd,
      :repo,
      :status,
      :title,
      :url
    ])
  end

  defp idempotency_root(attrs) do
    Map.get(attrs, :observability_root) || Map.get(attrs, :repo_root)
  end

  @spec refresh_base_branch(map(), command_runner()) ::
          :ok | {:skipped, term()} | {:error, term()}
  def refresh_base_branch(attrs, runner \\ &System.cmd/3) do
    base_branch = Map.get(attrs, :base_branch, "main")
    cwd = Map.fetch!(attrs, :cwd)
    git_gateway = Map.get(attrs, :git_gateway, &GitGateway.run/2)
    started_at = System.monotonic_time(:millisecond)

    Logger.info(
      "symphony.github: refresh_base start repo=#{inspect(Map.get(attrs, :repo))} base=#{base_branch} cwd=#{cwd}"
    )

    case git_gateway.(cwd, fn ->
           with :ok <- git_fetch_base(cwd, base_branch, attrs, runner),
                {:ok, current_branch} <- current_branch(cwd, attrs, runner),
                result <- maybe_fast_forward_base(cwd, current_branch, base_branch, attrs, runner) do
             result
           end
         end) do
      :ok = result ->
        elapsed_ms = System.monotonic_time(:millisecond) - started_at
        log_refresh_base_success(attrs, base_branch, elapsed_ms, result)
        result

      {:skipped, _reason} = result ->
        elapsed_ms = System.monotonic_time(:millisecond) - started_at
        log_refresh_base_success(attrs, base_branch, elapsed_ms, result)
        result

      {:error, reason} ->
        elapsed_ms = System.monotonic_time(:millisecond) - started_at
        sanitized_reason = sanitized_inspect(reason)

        Logger.warning(
          "symphony.github: refresh_base finish repo=#{inspect(Map.get(attrs, :repo))} base=#{base_branch} exit=1 elapsed_ms=#{elapsed_ms} reason=#{sanitized_reason}"
        )

        {:error, reason}
    end
  end

  defp decode_pull_request({:ok, pull_requests}, attrs) when is_list(pull_requests) do
    pull_requests
    |> reusable_pull_request()
    |> case do
      nil -> :none
      pull_request -> decode_pull_request(pull_request, attrs)
    end
  end

  defp decode_pull_request(%{} = pull_request, attrs) do
    {:ok,
     %{
       base_branch: pull_request["baseRefName"],
       branch: pull_request["headRefName"] || attrs.branch,
       cwd: attrs.cwd,
       repo: attrs.repo,
       status: normalize_pull_request_status(pull_request["state"]),
       title: pull_request["title"],
       url: pull_request["url"]
     }}
  end

  defp decode_pull_request({:error, reason}, _attrs), do: {:error, reason}

  defp decode_pull_request_checks(output) do
    trimmed_output = String.trim(output)

    case Jason.decode(output) do
      {:ok, checks} when is_list(checks) ->
        blocked = Enum.reject(checks, &passing_check?/1)

        cond do
          checks == [] -> {:ok, {:blocked, []}}
          blocked == [] -> {:ok, :passing}
          true -> {:ok, {:blocked, format_blocked_checks(blocked)}}
        end

      {:ok, decoded} ->
        {:error, {:invalid_checks_payload, decoded}}

      {:error, reason} ->
        if trimmed_output != "" and plain_text_no_checks_output?(trimmed_output) do
          {:ok, {:blocked, [no_checks_reported_check(trimmed_output)]}}
        else
          {:error, {:invalid_checks_payload, reason}}
        end
    end
  end

  defp passing_check?(%{"bucket" => "pass"}), do: true
  defp passing_check?(_check), do: false

  defp plain_text_no_checks_output?(output) do
    output
    |> String.downcase()
    |> String.starts_with?("no checks")
  end

  defp no_checks_reported_check(output) do
    %{
      name: "GitHub reported no checks",
      state: output,
      bucket: "missing"
    }
  end

  defp format_blocked_checks(checks) do
    Enum.map(checks, fn check ->
      %{
        name: Map.get(check, "name"),
        state: Map.get(check, "state"),
        bucket: Map.get(check, "bucket")
      }
    end)
  end

  defp reusable_pull_request(pull_requests) do
    Enum.find(pull_requests, &(normalize_pull_request_status(&1["state"]) == :open)) ||
      Enum.find(pull_requests, &(normalize_pull_request_status(&1["state"]) == :closed))
  end

  defp merge_flag(pull_request) do
    pull_request
    |> Map.get(:merge_strategy)
    |> normalize_merge_strategy()
    |> case do
      {:ok, strategy} -> {:ok, "--" <> strategy}
      {:error, reason} -> {:error, reason}
    end
  end

  defp normalize_merge_strategy(nil), do: {:ok, "merge"}
  defp normalize_merge_strategy(:merge), do: {:ok, "merge"}
  defp normalize_merge_strategy(:squash), do: {:ok, "squash"}
  defp normalize_merge_strategy(:rebase), do: {:ok, "rebase"}
  defp normalize_merge_strategy("merge"), do: {:ok, "merge"}
  defp normalize_merge_strategy("squash"), do: {:ok, "squash"}
  defp normalize_merge_strategy("rebase"), do: {:ok, "rebase"}

  defp normalize_merge_strategy(strategy) when is_binary(strategy) do
    case strategy |> String.trim() |> String.downcase() do
      "merge" -> {:ok, "merge"}
      "squash" -> {:ok, "squash"}
      "rebase" -> {:ok, "rebase"}
      other -> {:error, {:invalid_merge_strategy, other}}
    end
  end

  defp normalize_merge_strategy(strategy), do: {:error, {:invalid_merge_strategy, strategy}}

  defp normalize_pull_request_status("OPEN"), do: :open
  defp normalize_pull_request_status("MERGED"), do: :merged
  defp normalize_pull_request_status("CLOSED"), do: :closed
  defp normalize_pull_request_status(_status), do: :unknown

  defp repo_args(%{repo: repo}) when is_binary(repo), do: ["--repo", repo]
  defp repo_args(_attrs), do: []

  defp current_branch(cwd, attrs, runner) do
    case run_command("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd, attrs, runner) do
      {:ok, {output, 0}} ->
        {:ok, String.trim(output)}

      {:ok, {output, exit_status}} ->
        {:error, {:command_failed, "git", exit_status, String.trim(output)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp maybe_fast_forward_base(cwd, base_branch, base_branch, attrs, runner) do
    git_fast_forward(cwd, attrs, runner)
  end

  defp maybe_fast_forward_base(_cwd, current_branch, base_branch, _attrs, _runner) do
    {:skipped, {:current_branch_not_base_branch, current_branch, base_branch}}
  end

  defp git_fetch_base(cwd, base_branch, attrs, runner) do
    case run_command("git", ["fetch", "origin", base_branch], cwd, attrs, runner) do
      {:ok, {_output, 0}} ->
        :ok

      {:ok, {output, exit_status}} ->
        {:error, {:command_failed, "git", exit_status, String.trim(output)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp log_refresh_base_success(attrs, base_branch, elapsed_ms, :ok) do
    Logger.info(
      "symphony.github: refresh_base finish repo=#{inspect(Map.get(attrs, :repo))} base=#{base_branch} exit=0 elapsed_ms=#{elapsed_ms} result=fast_forwarded"
    )
  end

  defp log_refresh_base_success(
         attrs,
         base_branch,
         elapsed_ms,
         {:skipped, {:current_branch_not_base_branch, current_branch, skipped_base_branch}}
       )
       when skipped_base_branch == base_branch do
    Logger.info(
      "symphony.github: refresh_base finish repo=#{inspect(Map.get(attrs, :repo))} base=#{base_branch} exit=0 elapsed_ms=#{elapsed_ms} result=skipped reason=current_branch_not_base_branch current_branch=#{current_branch}"
    )
  end

  defp git_fast_forward(cwd, attrs, runner) do
    case run_command("git", ["merge", "--ff-only", "FETCH_HEAD"], cwd, attrs, runner) do
      {:ok, {_output, 0}} ->
        :ok

      {:ok, {output, exit_status}} ->
        {:error, {:command_failed, "git", exit_status, String.trim(output)}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp issue_identifier(%{issue_identifier: issue_identifier}) when is_binary(issue_identifier),
    do: issue_identifier

  defp issue_identifier(%{issue: %{identifier: issue_identifier}})
       when is_binary(issue_identifier), do: issue_identifier

  defp issue_identifier(_attrs), do: "unknown-issue"

  defp command_options(cwd, command) do
    [cd: cwd, env: command_env(command), stderr_to_stdout: true]
  end

  defp command_env("gh"), do: @gh_command_env
  defp command_env("git"), do: @git_command_env
  defp command_env(_command), do: []

  defp command_timeout_ms(attrs) do
    case Map.get(attrs, :command_timeout_ms, @default_command_timeout_ms) do
      timeout_ms when is_integer(timeout_ms) and timeout_ms > 0 -> timeout_ms
      _other -> @default_command_timeout_ms
    end
  end

  # GitHub subprocess calls stay single-attempt on purpose. The bounded timeout
  # plus non-interactive environment is the safety policy here because replaying
  # subprocess-backed mutations is not generally safe.
  defp run_command(command, args, cwd, attrs, runner) do
    options = command_options(cwd, command)
    timeout_ms = command_timeout_ms(attrs)
    parent = self()
    ref = make_ref()

    {pid, monitor_ref} =
      spawn_monitor(fn ->
        send(parent, {ref, runner.(command, args, options)})
      end)

    receive do
      {^ref, {output, exit_status}} when is_binary(output) and is_integer(exit_status) ->
        Process.demonitor(monitor_ref, [:flush])
        {:ok, {output, exit_status}}

      {^ref, other} ->
        Process.demonitor(monitor_ref, [:flush])
        {:error, {:invalid_command_result, command, other}}

      {:DOWN, ^monitor_ref, :process, ^pid, reason} ->
        receive do
          {^ref, {output, exit_status}} when is_binary(output) and is_integer(exit_status) ->
            {:ok, {output, exit_status}}

          {^ref, other} ->
            {:error, {:invalid_command_result, command, other}}
        after
          0 ->
            {:error, {:command_runner_exited, command, reason}}
        end
    after
      timeout_ms ->
        terminate_runner_subprocesses(pid)
        Process.exit(pid, :kill)
        flush_command_messages(ref, monitor_ref, pid)
        {:error, {:command_timed_out, command, timeout_ms}}
    end
  end

  defp flush_command_messages(ref, monitor_ref, pid) do
    receive do
      {:DOWN, ^monitor_ref, :process, ^pid, _reason} -> :ok
    after
      0 -> :ok
    end

    receive do
      {^ref, _result} -> :ok
    after
      0 -> :ok
    end
  end

  defp terminate_runner_subprocesses(pid) when is_pid(pid) do
    pid
    |> linked_port_os_pids()
    |> Enum.each(&terminate_os_process_tree/1)
  end

  defp linked_port_os_pids(pid) do
    case Process.info(pid, :links) do
      {:links, links} ->
        links
        |> Enum.filter(&is_port/1)
        |> Enum.flat_map(fn port ->
          case Port.info(port, :os_pid) do
            {:os_pid, os_pid} when is_integer(os_pid) and os_pid > 0 -> [os_pid]
            _other -> []
          end
        end)
        |> Enum.uniq()

      _other ->
        []
    end
  end

  defp terminate_os_process_tree(root_pid) when is_integer(root_pid) and root_pid > 0 do
    root_pid
    |> os_process_tree()
    |> terminate_os_processes("TERM")
    |> then(fn pids ->
      Process.sleep(50)

      pids
      |> Enum.filter(&os_process_alive?/1)
      |> terminate_os_processes("KILL")
    end)

    :ok
  end

  defp os_process_tree(root_pid) do
    process_tree = process_tree_by_parent()

    descendants =
      collect_descendant_pids(root_pid, process_tree)
      |> Enum.reverse()

    descendants ++ [root_pid]
  end

  defp process_tree_by_parent do
    case System.cmd("ps", ["-axo", "pid=,ppid="], stderr_to_stdout: true) do
      {output, 0} ->
        output
        |> String.split("\n", trim: true)
        |> Enum.reduce(%{}, fn line, acc ->
          case String.split(String.trim(line), ~r/\s+/, parts: 2) do
            [pid_text, ppid_text] ->
              with {pid, ""} <- Integer.parse(pid_text),
                   {ppid, ""} <- Integer.parse(ppid_text) do
                Map.update(acc, ppid, [pid], &[pid | &1])
              else
                _other -> acc
              end

            _other ->
              acc
          end
        end)

      _other ->
        %{}
    end
  end

  defp collect_descendant_pids(pid, process_tree) do
    process_tree
    |> Map.get(pid, [])
    |> Enum.flat_map(fn child_pid ->
      [child_pid | collect_descendant_pids(child_pid, process_tree)]
    end)
  end

  defp terminate_os_processes(pids, signal) do
    Enum.each(pids, fn pid ->
      System.cmd("kill", ["-#{signal}", Integer.to_string(pid)], stderr_to_stdout: true)
    end)

    pids
  end

  defp os_process_alive?(pid) when is_integer(pid) and pid > 0 do
    case System.cmd("sh", ["-c", "kill -0 #{pid}"], stderr_to_stdout: true) do
      {_output, 0} -> true
      _other -> false
    end
  end

  defp format_command_error({:command_failed, command, exit_status, output}) do
    "#{command} exit #{exit_status}: #{output}"
  end

  defp format_command_error({:command_timed_out, command, timeout_ms}) do
    "#{command} timed out after #{timeout_ms}ms"
  end

  defp format_command_error(reason), do: inspect(reason)

  defp sanitized_output(output) do
    output
    |> String.trim()
    |> EventLog.sanitize_value()
  end

  defp sanitized_inspect(value) do
    value
    |> inspect()
    |> EventLog.sanitize_value()
  end
end
