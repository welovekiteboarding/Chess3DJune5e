defmodule Symphony1.Core.Linear do
  alias Symphony1.Core.Idempotency
  alias Symphony1.Core.Retry
  alias Symphony1.Core.Workflow

  @http_timeout_ms 15_000
  @http_connect_timeout_ms 5_000
  @default_retry_policy [
    max_attempts: 3,
    base_delay_ms: 100,
    max_delay_ms: 1_000
  ]
  @max_issue_pages 100

  @type config :: %{
          required(:api_key) => String.t(),
          required(:team_key) => String.t(),
          optional(:retry_policy) => keyword()
        }

  @type requester :: (String.t(), map(), String.t() -> {:ok, map()} | {:error, term()})

  @teams_query """
  query {
    teams {
      nodes {
        id
        key
        name
        states {
          nodes {
            id
            name
            type
            color
          }
        }
      }
    }
  }
  """

  @team_issues_query """
  query TeamIssues($teamId: String!, $after: String) {
    team(id: $teamId) {
      id
      key
      name
      issues(first: 50, after: $after) {
        nodes {
          id
          identifier
          title
          description
          state {
            id
            name
            type
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
  """

  @issue_by_identifier_query """
  query IssueByIdentifier($id: String!) {
    issue(id: $id) {
      id
      identifier
      title
      description
      state {
        id
        name
        type
      }
      team {
        id
        key
      }
    }
  }
  """

  @transition_issue_mutation """
  mutation TransitionIssue($id: String!, $input: IssueUpdateInput!) {
    issueUpdate(id: $id, input: $input) {
      success
      issue {
        id
        identifier
        title
        description
        state {
          id
          name
          type
        }
      }
    }
  }
  """

  @create_issue_mutation """
  mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $stateId: String!) {
    issueCreate(
      input: {
        teamId: $teamId
        title: $title
        description: $description
        stateId: $stateId
      }
    ) {
      success
      issue {
        id
        identifier
        title
        description
        state {
          id
          name
          type
        }
      }
    }
  }
  """

  @create_team_mutation """
  mutation CreateTeam($input: TeamCreateInput!) {
    teamCreate(input: $input) {
      success
      team {
        id
        key
        name
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  }
  """

  @create_workflow_state_mutation """
  mutation CreateWorkflowState($input: WorkflowStateCreateInput!) {
    workflowStateCreate(input: $input) {
      success
      workflowState {
        id
        name
        type
      }
    }
  }
  """

  @spec load_team(config(), requester()) :: {:ok, map()} | {:error, term()}
  def load_team(config, requester \\ &request/3) do
    with {:ok, response} <-
           linear_request(config, requester, @teams_query, %{}, safe_retry?: true),
         {:ok, team} <- find_team(response, config.team_key) do
      {:ok,
       %{
         id: team["id"],
         key: team["key"],
         name: team["name"],
         states: Enum.map(team["states"]["nodes"], &normalize_state/1)
       }}
    end
  end

  @spec poll_eligible_issue(config(), requester()) :: {:ok, map()} | :none | {:error, term()}
  def poll_eligible_issue(config, requester \\ &request/3) do
    poll_issue_in_state(config, "Todo", requester)
  end

  @spec poll_eligible_issue(config(), [String.t()] | nil, requester()) ::
          {:ok, map()} | :none | {:error, term()}
  def poll_eligible_issue(config, nil, requester) do
    poll_eligible_issue(config, requester)
  end

  def poll_eligible_issue(_config, [], _requester), do: :none

  def poll_eligible_issue(config, allowed_identifiers, requester)
      when is_list(allowed_identifiers) do
    allowed = MapSet.new(allowed_identifiers)

    with {:ok, issues} <- list_team_issues(config, requester) do
      case Enum.find(
             issues,
             &(MapSet.member?(allowed, &1.identifier) and eligible_state?(&1.state))
           ) do
        nil -> :none
        issue -> {:ok, issue}
      end
    end
  end

  defp eligible_state?(state), do: state in ["Todo", "In Progress", "Finalizing"]

  @spec poll_issue_in_state(config(), String.t(), requester()) ::
          {:ok, map()} | :none | {:error, term()}
  def poll_issue_in_state(config, state_name, requester \\ &request/3) do
    with {:ok, issues} <- list_team_issues(config, requester) do
      issues
      |> find_issue_in_state(state_name)
    end
  end

  @spec poll_issues_in_state(config(), String.t(), requester()) ::
          {:ok, [map()]} | {:error, term()}
  def poll_issues_in_state(config, state_name, requester \\ &request/3) do
    with {:ok, issues} <- list_team_issues(config, requester) do
      matching =
        issues
        |> Enum.filter(&(&1.state == state_name))

      {:ok, matching}
    end
  end

  @spec poll_issue_in_states(config(), [String.t()], requester()) ::
          {:ok, map()} | :none | {:error, term()}
  def poll_issue_in_states(config, state_names, requester \\ &request/3)
      when is_list(state_names) do
    with {:ok, issues} <- list_team_issues(config, requester) do
      Enum.find_value(state_names, :none, fn state_name ->
        case find_issue_in_state(issues, state_name) do
          {:ok, issue} -> {:ok, issue}
          :none -> false
        end
      end)
    end
  end

  @spec find_issue_by_identifier(config(), String.t(), requester()) ::
          {:ok, map()} | :none | {:error, term()}
  def find_issue_by_identifier(config, issue_identifier, requester \\ &request/3) do
    with {:ok, response} <-
           linear_request(
             config,
             requester,
             @issue_by_identifier_query,
             %{"id" => issue_identifier},
             safe_retry?: true
           ),
         {:ok, issue} <- extract_issue_by_identifier(response) do
      issue
      |> reject_issue_from_other_team(config.team_key)
      |> case do
        nil -> :none
        issue -> {:ok, normalize_issue(issue)}
      end
    end
  end

  @spec list_team_issues(config(), requester()) :: {:ok, [map()]} | {:error, term()}
  def list_team_issues(config, requester \\ &request/3) do
    with {:ok, team} <- load_team(config, requester),
         {:ok, issues} <- fetch_team_issues(team.id, config, requester) do
      {:ok,
       issues
       |> Enum.map(&normalize_issue/1)
       |> Enum.map(&Map.put(&1, :team_id, team.id))}
    end
  end

  @spec transition_issue(map(), String.t(), config(), requester()) ::
          {:ok, map()} | {:error, term()}
  def transition_issue(issue, new_state, config, requester \\ &request/3) do
    transition_issue(issue, new_state, %{}, config, requester)
  end

  @spec transition_issue(map(), String.t(), map(), config(), requester()) ::
          {:ok, map()} | {:error, term()}
  def transition_issue(issue, new_state, attrs, config, requester) do
    with :ok <- Workflow.validate_transition(issue.state, new_state),
         {:ok, team} <- load_team(config, requester),
         {:ok, target_state} <- find_state(team.states, new_state),
         {:ok, response} <-
           requester.(
             @transition_issue_mutation,
             %{
               "id" => issue.id,
               "input" =>
                 attrs
                 |> Map.put("stateId", target_state.id)
             },
             config.api_key
           ),
         {:ok, updated_issue} <- extract_updated_issue(response) do
      {:ok, merge_issue_fields(issue, normalize_issue(updated_issue))}
    end
  end

  @spec create_issue(config(), map(), requester()) :: {:ok, map()} | {:error, term()}
  def create_issue(config, attrs, requester \\ &request/3) do
    case issue_create_idempotency_spec(config, attrs) do
      nil ->
        do_create_issue(config, attrs, requester)

      spec ->
        case Idempotency.run(spec, fn -> do_create_issue(config, attrs, requester) end) do
          {:ok, issue, _mode} -> {:ok, issue}
          {:error, reason} -> {:error, reason}
        end
    end
  end

  defp do_create_issue(config, attrs, requester) do
    with {:ok, team} <- load_team(config, requester),
         {:ok, target_state} <- find_state(team.states, attrs["state"]),
         {:ok, response} <-
           requester.(
             @create_issue_mutation,
             %{
               "teamId" => team.id,
               "title" => attrs["title"],
               "description" => attrs["description"],
               "stateId" => target_state.id
             },
             config.api_key
           ),
         {:ok, issue} <- extract_created_issue(response) do
      {:ok, Map.put(normalize_issue(issue), :team_id, team.id)}
    end
  end

  defp issue_create_idempotency_spec(config, attrs) do
    case issue_create_idempotency_root(attrs) do
      nil ->
        nil

      root ->
        stable_identifier =
          attrs["graph_task_id"] || attrs["issue_identifier"] || attrs["title"] || "issue-create"

        %{
          root: root,
          scope: "linear.issue_create",
          key: "#{config.team_key}:#{stable_identifier}",
          fingerprint: %{
            "team_key" => config.team_key,
            "graph_task_id" => attrs["graph_task_id"],
            "issue_identifier" => attrs["issue_identifier"],
            "title" => attrs["title"],
            "description" => attrs["description"],
            "state" => attrs["state"]
          },
          decode_result: &Idempotency.restore_keys/1,
          after_record: attrs["idempotency_after_issue_create_record"]
        }
    end
  end

  defp issue_create_idempotency_root(attrs) do
    attrs["idempotency_root"] || attrs["observability_root"] || attrs["repo_root"] || File.cwd!()
  end

  @spec create_team(map(), map(), requester()) :: {:ok, map()} | {:error, term()}
  def create_team(config, attrs, requester \\ &request/3) do
    with {:ok, response} <-
           requester.(
             @create_team_mutation,
             %{
               "input" => %{
                 "key" => attrs["key"],
                 "name" => attrs["name"]
               }
             },
             config.api_key
           ),
         {:ok, team} <- extract_created_team(response) do
      {:ok,
       %{
         id: team["id"],
         key: team["key"],
         name: team["name"],
         states: Enum.map(team["states"]["nodes"], &normalize_state/1)
       }}
    end
  end

  @spec create_workflow_state(map(), map(), requester()) :: {:ok, map()} | {:error, term()}
  def create_workflow_state(config, attrs, requester \\ &request/3) do
    with {:ok, response} <-
           requester.(
             @create_workflow_state_mutation,
             %{
               "input" => %{
                 "color" => attrs["color"],
                 "name" => attrs["name"],
                 "position" => attrs["position"],
                 "teamId" => attrs["teamId"],
                 "type" => attrs["type"]
               }
             },
             config.api_key
           ),
         {:ok, state} <- extract_created_workflow_state(response) do
      {:ok, normalize_state(state)}
    end
  end

  @update_workflow_state_mutation """
  mutation UpdateWorkflowState($id: String!, $input: WorkflowStateUpdateInput!) {
    workflowStateUpdate(id: $id, input: $input) {
      success
      workflowState {
        id
        name
        type
      }
    }
  }
  """

  @spec update_workflow_state(map(), map(), requester()) :: {:ok, map()} | {:error, term()}
  def update_workflow_state(config, attrs, requester \\ &request/3) do
    with {:ok, response} <-
           requester.(
             @update_workflow_state_mutation,
             %{
               "id" => attrs["id"],
               "input" => Map.drop(attrs, ["id"])
             },
             config.api_key
           ) do
      case response do
        %{"data" => %{"workflowStateUpdate" => %{"success" => true, "workflowState" => state}}} ->
          {:ok, normalize_state(state)}

        %{"data" => %{"workflowStateUpdate" => %{"success" => false}}} ->
          {:error, :update_failed}

        %{"errors" => errors} ->
          {:error, {:graphql_error, errors}}
      end
    end
  end

  @spec request(String.t(), map(), String.t()) :: {:ok, map()} | {:error, term()}
  def request(query, variables, api_key) do
    :inets.start()
    :ssl.start()

    payload = Jason.encode!(%{query: query, variables: variables})

    headers = [
      {~c"Content-Type", ~c"application/json"},
      {~c"Authorization", String.to_charlist(api_key)}
    ]

    request = {~c"https://api.linear.app/graphql", headers, ~c"application/json", payload}
    http_client = http_client_module()

    http_options = [
      timeout: @http_timeout_ms,
      connect_timeout: @http_connect_timeout_ms,
      ssl: linear_ssl_options()
    ]

    with {:ok, {{_http_version, 200, _reason_phrase}, _headers, body}} <-
           http_client.request(:post, request, http_options, []),
         {:ok, decoded} <- Jason.decode(body),
         :ok <- ensure_no_graphql_errors(decoded) do
      {:ok, decoded}
    else
      {:ok, {{_http_version, status, _reason_phrase}, _headers, body}} ->
        {:error, {:http_error, status, body}}

      {:error, {:graphql_error, _errors} = reason} ->
        {:error, reason}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp http_client_module do
    Application.get_env(:symphony_1, :linear_http_client, :httpc)
  end

  defp linear_ssl_options do
    [
      verify: :verify_peer,
      cacerts: :public_key.cacerts_get(),
      depth: 3,
      server_name_indication: ~c"api.linear.app",
      customize_hostname_check: [
        match_fun: :public_key.pkix_verify_hostname_match_fun(:https)
      ]
    ]
  end

  defp linear_request(config, requester, query, variables, opts) do
    operation = fn -> requester.(query, variables, config.api_key) end

    if Keyword.get(opts, :safe_retry?, false) do
      Retry.run(operation, linear_retry_policy(config))
    else
      operation.()
    end
  end

  defp linear_retry_policy(config) do
    @default_retry_policy
    |> Keyword.merge(Map.get(config, :retry_policy, []))
    |> Keyword.put(:retry_if, &retryable_http_error?/2)
  end

  defp retryable_http_error?({:http_error, 429, _body}, _context), do: true

  defp retryable_http_error?({:http_error, status, _body}, _context)
       when is_integer(status) and status >= 500 and status <= 599 do
    true
  end

  defp retryable_http_error?(_reason, _context), do: false

  defp find_team(%{"data" => %{"teams" => %{"nodes" => teams}}}, team_key) do
    case Enum.find(teams, &(&1["key"] == team_key)) do
      nil -> {:error, {:team_not_found, team_key}}
      team -> {:ok, team}
    end
  end

  defp find_team(%{"errors" => errors}, _team_key), do: {:error, {:graphql_error, errors}}
  defp find_team(_response, team_key), do: {:error, {:team_not_found, team_key}}

  defp fetch_team_issues(
         team_id,
         config,
         requester,
         after_cursor \\ nil,
         acc \\ [],
         page_count \\ 0
       )

  defp fetch_team_issues(_team_id, _config, _requester, _after_cursor, _acc, page_count)
       when page_count >= @max_issue_pages do
    {:error, {:too_many_issue_pages, @max_issue_pages}}
  end

  defp fetch_team_issues(team_id, config, requester, after_cursor, acc, page_count) do
    with {:ok, response} <-
           linear_request(
             config,
             requester,
             @team_issues_query,
             %{"teamId" => team_id, "after" => after_cursor},
             safe_retry?: true
           ),
         {:ok, issues, page_info} <- extract_issues_page(response) do
      combined = acc ++ issues

      if page_info["hasNextPage"] do
        fetch_team_issues(
          team_id,
          config,
          requester,
          page_info["endCursor"],
          combined,
          page_count + 1
        )
      else
        {:ok, combined}
      end
    end
  end

  defp extract_issues_page(%{
         "data" => %{"team" => %{"issues" => %{"nodes" => issues, "pageInfo" => page_info}}}
       }),
       do: {:ok, issues, page_info}

  defp extract_issues_page(%{"data" => %{"team" => %{"issues" => %{"nodes" => issues}}}}),
    do: {:ok, issues, %{"hasNextPage" => false, "endCursor" => nil}}

  defp extract_issues_page(%{"errors" => errors}), do: {:error, {:graphql_error, errors}}

  defp extract_issues_page(response),
    do: {:error, {:malformed_issue_list_response, response}}

  defp extract_issue_by_identifier(%{"data" => %{"issue" => nil}}), do: :none
  defp extract_issue_by_identifier(%{"data" => %{"issue" => issue}}), do: {:ok, issue}
  defp extract_issue_by_identifier(%{"errors" => errors}), do: {:error, {:graphql_error, errors}}

  defp extract_issue_by_identifier(response),
    do: {:error, {:malformed_issue_lookup_response, response}}

  defp extract_updated_issue(%{
         "data" => %{"issueUpdate" => %{"success" => true, "issue" => issue}}
       }),
       do: {:ok, issue}

  defp extract_updated_issue(%{"errors" => errors}), do: {:error, {:graphql_error, errors}}
  defp extract_updated_issue(_response), do: {:error, :issue_update_failed}

  defp extract_created_issue(%{
         "data" => %{"issueCreate" => %{"success" => true, "issue" => issue}}
       }),
       do: {:ok, issue}

  defp extract_created_issue(%{"errors" => errors}), do: {:error, {:graphql_error, errors}}
  defp extract_created_issue(_response), do: {:error, :issue_create_failed}

  defp extract_created_team(%{"data" => %{"teamCreate" => %{"success" => true, "team" => team}}}),
    do: {:ok, team}

  defp extract_created_team(%{"errors" => errors}), do: {:error, {:graphql_error, errors}}
  defp extract_created_team(_response), do: {:error, :team_create_failed}

  defp extract_created_workflow_state(%{
         "data" => %{"workflowStateCreate" => %{"success" => true, "workflowState" => state}}
       }),
       do: {:ok, state}

  defp extract_created_workflow_state(%{"errors" => errors}),
    do: {:error, {:graphql_error, errors}}

  defp extract_created_workflow_state(_response), do: {:error, :workflow_state_create_failed}

  defp find_issue_in_state(issues, state_name) do
    case Enum.find(issues, &(&1.state == state_name)) do
      nil -> :none
      issue -> {:ok, issue}
    end
  end

  defp find_state(states, state_name) do
    case Enum.find(states, &(&1.name == state_name)) do
      nil -> {:error, {:state_not_found, state_name}}
      state -> {:ok, state}
    end
  end

  defp normalize_issue(issue) do
    base = %{
      id: issue["id"],
      identifier: issue["identifier"],
      title: issue["title"],
      description: issue["description"],
      state: issue["state"]["name"],
      state_id: issue["state"]["id"],
      state_type: issue["state"]["type"]
    }

    case get_in(issue, ["team", "id"]) do
      nil -> base
      team_id -> Map.put(base, :team_id, team_id)
    end
  end

  defp reject_issue_from_other_team(issue, team_key) do
    case get_in(issue, ["team", "key"]) do
      nil -> issue
      ^team_key -> issue
      _other_team -> nil
    end
  end

  defp merge_issue_fields(existing_issue, updated_issue) do
    Enum.reduce(updated_issue, existing_issue, fn
      {_key, nil}, acc -> acc
      {key, value}, acc -> Map.put(acc, key, value)
    end)
  end

  defp normalize_state(state) do
    %{
      id: state["id"],
      name: state["name"],
      type: state["type"],
      color: state["color"]
    }
  end

  defp ensure_no_graphql_errors(%{"errors" => errors}), do: {:error, {:graphql_error, errors}}
  defp ensure_no_graphql_errors(_decoded), do: :ok
end
