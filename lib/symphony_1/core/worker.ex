defmodule Symphony1.Core.Worker do
  @worker_log_filenames [
    prompt_path: "worker-prompt.txt",
    raw_log_path: "worker.jsonl",
    output_path: "worker-last-message.txt",
    meta_path: "worker-meta.json"
  ]

  @review_log_filenames [
    prompt_path: "review-prompt.txt",
    raw_log_path: "review.jsonl",
    output_path: "review-last-message.txt",
    meta_path: "review-meta.json"
  ]

  @log_path_keys [:log_dir, :prompt_path, :raw_log_path, :output_path, :meta_path]

  @type run_spec :: %{
          command: String.t(),
          args: [String.t()],
          cd: String.t(),
          env: %{optional(String.t()) => String.t()}
        }

  @type session :: %{
          port: port(),
          buffer: String.t(),
          next_id: pos_integer(),
          thread_id: String.t() | nil,
          turn_id: String.t() | nil,
          command: String.t() | nil
        }

  @initialize_timeout 10_000
  @turn_timeout 60_000

  @spec local_run_spec(map()) :: run_spec()
  def local_run_spec(%{workspace: workspace, workflow_path: workflow_path} = attrs) do
    %{
      command: Map.get(attrs, :codex_command, "codex"),
      args: ["app-server", "--listen", "stdio://"],
      cd: workspace,
      env: %{
        "SYMPHONY_WORKFLOW_PATH" => workflow_path
      }
    }
  end

  @spec log_paths(:worker | :review, String.t()) :: keyword()
  def log_paths(kind, log_dir) when kind in [:worker, :review] and is_binary(log_dir) do
    filenames =
      case kind do
        :worker -> @worker_log_filenames
        :review -> @review_log_filenames
      end

    [log_dir: log_dir] ++
      Enum.map(filenames, fn {key, filename} ->
        {key, Path.join(log_dir, filename)}
      end)
  end

  @spec start_run(map()) :: {:ok, port()} | {:error, term()}
  def start_run(attrs) do
    spec = local_run_spec(attrs)

    case System.find_executable(spec.command) do
      nil ->
        {:error, {:missing_executable, spec.command}}

      executable ->
        port =
          Port.open({:spawn_executable, executable}, [
            :binary,
            :exit_status,
            {:args, Enum.map(spec.args, &String.to_charlist/1)},
            {:cd, String.to_charlist(spec.cd)},
            {:env,
             Enum.map(spec.env, fn {key, value} ->
               {String.to_charlist(key), String.to_charlist(value)}
             end)}
          ])

        {:ok, port}
    end
  rescue
    error -> {:error, error}
  end

  @spec start_session(map()) :: {:ok, session()} | {:error, term()}
  def start_session(attrs) do
    log_paths = session_log_paths(attrs)

    with :ok <- prepare_session_logs(log_paths, attrs),
         {:ok, port} <- start_run(attrs) do
      session = %{
        port: port,
        buffer: "",
        next_id: 1,
        thread_id: nil,
        turn_id: nil,
        command: format_run_command(local_run_spec(attrs))
      }

      session =
        session
        |> Map.merge(log_paths)
        |> Map.put(:rpc_method, nil)

      case initialize(session, attrs) do
        {:ok, session} ->
          case start_thread(session, attrs) do
            {:ok, session} ->
              _ =
                update_metadata(log_paths, %{
                  runtime: "app_server",
                  thread_id: session.thread_id,
                  status: "running"
                })

              {:ok, session}

            {:error, reason} = error ->
              _ =
                update_metadata(
                  log_paths,
                  %{
                    runtime: "app_server",
                    status: "error",
                    error: inspect(reason)
                  },
                  finished: true
                )

              _ = stop_run(port)
              error
          end

        {:error, reason} = error ->
          _ =
            update_metadata(
              log_paths,
              %{
                runtime: "app_server",
                status: "error",
                error: inspect(reason)
              },
              finished: true
            )

          _ = stop_run(port)
          error
      end
    else
      {:error, reason} = error ->
        _ =
          update_metadata(
            log_paths,
            %{
              runtime: "app_server",
              status: "error",
              error: inspect(reason)
            },
            finished: true
          )

        error
    end
  end

  @spec run_prompt(session(), String.t(), keyword()) ::
          {:ok, %{output: String.t(), thread_id: String.t(), turn_id: String.t()}}
          | {:error, term()}
  def run_prompt(session, prompt, opts \\ []) do
    timeout_ms = Keyword.get(opts, :timeout_ms, @turn_timeout)
    log_paths = prompt_log_paths(opts)

    request = %{
      "id" => session.next_id,
      "method" => "turn/start",
      "params" => %{
        "threadId" => session.thread_id,
        "input" => [
          %{"type" => "text", "text" => prompt}
        ]
      }
    }

    with :ok <- prepare_prompt_logs(log_paths, session, prompt, opts),
         :ok <- send_json(Map.merge(session, log_paths), request),
         {:ok, session, _turn_response} <-
           await_response(
             Map.merge(session, log_paths),
             session.next_id,
             @initialize_timeout,
             "turn/start"
           ),
         {:ok, _session, result} <-
           await_turn_completion(
             Map.merge(%{session | next_id: session.next_id + 1}, log_paths),
             timeout_ms
           ),
         :ok <- write_prompt_output(log_paths, result.output),
         :ok <- finish_prompt_metadata(log_paths, %{status: "ok", turn_id: result.turn_id}) do
      {:ok, Map.put(result, :thread_id, session.thread_id)}
    else
      {:error, reason} = error ->
        _ = finish_prompt_metadata(log_paths, %{status: "error", error: inspect(reason)})
        error
    end
  end

  @spec run_once(map(), String.t(), keyword()) ::
          {:ok, %{output: String.t(), thread_id: String.t() | nil, turn_id: String.t() | nil}}
          | {:error, term()}
  def run_once(attrs, prompt, opts \\ []) do
    workspace = Map.fetch!(attrs, :workspace)
    log_dir = Keyword.get(opts, :log_dir, default_log_dir(workspace))
    log_paths = merge_log_paths(:worker, log_dir, opts)
    timeout_ms = Keyword.get(opts, :timeout_ms, @turn_timeout)

    worker_attrs =
      attrs
      |> Map.merge(Enum.into(log_paths, %{}))
      |> maybe_put_attr(:codex_command, Keyword.get(opts, :codex_command))
      |> Map.put(:prompt, prompt)
      |> Map.put(:timeout_ms, timeout_ms)

    prompt_opts =
      [timeout_ms: timeout_ms, metadata: Keyword.get(opts, :metadata, %{})] ++ log_paths

    with {:ok, session} <- start_session(worker_attrs) do
      result = run_prompt(session, prompt, prompt_opts)
      stop_result = stop_session(session)

      case {result, stop_result} do
        {{:ok, worker_result}, :ok} -> {:ok, worker_result}
        {{:error, _reason} = error, :ok} -> error
        {{:ok, _worker_result}, {:error, reason}} -> {:error, {:worker_stop_failed, reason}}
        {{:error, _reason} = error, {:error, _stop_reason}} -> error
      end
    end
  end

  @spec stop_session(session()) :: :ok | {:error, term()}
  def stop_session(session) do
    stop_run(session.port)
  end

  @spec stop_run(port()) :: :ok | {:error, term()}
  def stop_run(port) do
    if Port.info(port) do
      Port.close(port)
    end

    :ok
  rescue
    ArgumentError -> :ok
    error -> {:error, error}
  end

  @doc false
  @spec decode_buffer(String.t()) :: {:ok, [map()], String.t()} | {:error, term()}
  def decode_buffer(buffer) do
    case :binary.split(buffer, "\n", [:global]) do
      [_partial] ->
        {:ok, [], buffer}

      parts ->
        complete = Enum.drop(parts, -1)
        rest = List.last(parts)

        with {:ok, messages} <- decode_complete_lines(complete) do
          {:ok, messages, rest}
        end
    end
  end

  defp initialize(session, attrs) do
    request = %{
      "id" => session.next_id,
      "method" => "initialize",
      "params" => %{
        "clientInfo" => %{
          "name" => "symphony-1",
          "version" => "0.1.0"
        }
      }
    }

    with :ok <- send_json(session, request),
         {:ok, session, _response} <-
           await_response(session, session.next_id, response_timeout(attrs), "initialize"),
         :ok <- send_json(session, %{"method" => "initialized"}) do
      {:ok, %{session | next_id: session.next_id + 1}}
    end
  end

  defp start_thread(session, attrs) do
    request = %{
      "id" => session.next_id,
      "method" => "thread/start",
      "params" => %{
        "approvalPolicy" => "never",
        "cwd" => attrs.workspace,
        "model" => "gpt-5.4",
        "personality" => "pragmatic",
        "sandbox" => "danger-full-access"
      }
    }

    with :ok <- send_json(session, request),
         {:ok, session, %{"thread" => %{"id" => thread_id}}} <-
           await_response(session, session.next_id, response_timeout(attrs), "thread/start") do
      {:ok, %{session | next_id: session.next_id + 1, thread_id: thread_id}}
    end
  end

  defp await_turn_completion(session, timeout_ms) do
    await_turn_completion(
      session,
      %{output: "", turn_id: nil},
      System.monotonic_time(:millisecond) + timeout_ms
    )
  end

  defp await_turn_completion(session, result, deadline_ms) do
    remaining = max(deadline_ms - System.monotonic_time(:millisecond), 0)

    if remaining == 0 do
      {:error, :turn_timeout}
    else
      case consume_buffered_turn_messages(session, result, deadline_ms) do
        {:continue, session, result} ->
          receive do
            {port, {:data, data}} when port == session.port ->
              case decode_session_messages(%{session | buffer: session.buffer <> data}) do
                {:ok, session, messages} ->
                  case consume_turn_messages(messages, result) do
                    {:completed, result} ->
                      {:ok, session, result}

                    {:continue, result} ->
                      await_turn_completion(session, result, deadline_ms)

                    {:error, reason} ->
                      {:error, reason}
                  end

                {:error, reason} ->
                  {:error, reason}
              end

            {port, {:exit_status, status}} when port == session.port ->
              {:error, {:worker_exit, status}}
          after
            remaining ->
              {:error, :turn_timeout}
          end

        completed_or_error ->
          completed_or_error
      end
    end
  end

  defp consume_buffered_turn_messages(%{buffer: ""} = session, result, _deadline_ms) do
    {:continue, session, result}
  end

  defp consume_buffered_turn_messages(session, result, deadline_ms) do
    case decode_session_messages(session) do
      {:ok, session, []} ->
        {:continue, session, result}

      {:ok, session, messages} ->
        case consume_turn_messages(messages, result) do
          {:completed, result} ->
            {:ok, session, result}

          {:continue, result} ->
            await_turn_completion(session, result, deadline_ms)

          {:error, reason} ->
            {:error, reason}
        end

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp consume_turn_messages(messages, result) do
    Enum.reduce_while(messages, {:continue, result}, fn
      %{
        "method" => "item/completed",
        "params" => %{"item" => %{"type" => "agentMessage", "text" => text} = item}
      },
      {:continue, result} ->
        updated =
          result
          |> Map.put(:output, text)
          |> Map.put(:turn_id, Map.get(item, "turnId", result.turn_id))

        {:cont, {:continue, updated}}

      %{"method" => "item/agentMessage/delta", "params" => %{"delta" => delta}},
      {:continue, result} ->
        {:cont, {:continue, %{result | output: result.output <> delta}}}

      %{"method" => "turn/started", "params" => %{"turn" => %{"id" => turn_id}}},
      {:continue, result} ->
        {:cont, {:continue, %{result | turn_id: turn_id}}}

      %{"method" => "turn/completed", "params" => %{"turn" => %{"status" => "completed"}}},
      {:continue, result} ->
        {:halt, {:completed, result}}

      %{"method" => "turn/completed", "params" => %{"turn" => turn}}, {:continue, _result} ->
        {:halt, {:error, {:app_server_turn_failed, turn}}}

      _message, acc ->
        {:cont, acc}
    end)
  end

  defp await_response(session, id, timeout_ms, method) do
    await_response_until(
      session,
      id,
      System.monotonic_time(:millisecond) + timeout_ms,
      method
    )
  end

  defp await_response_until(session, id, deadline_ms, method) do
    remaining = max(deadline_ms - System.monotonic_time(:millisecond), 0)

    if remaining == 0 do
      {:error, {:timeout, id}}
    else
      do_await_response_until(session, id, deadline_ms, remaining, method)
    end
  end

  defp do_await_response_until(session, id, deadline_ms, remaining, method) do
    receive do
      {port, {:data, data}} when port == session.port ->
        case decode_session_messages(%{session | buffer: session.buffer <> data}) do
          {:ok, session, messages} ->
            case take_response(messages, id) do
              nil ->
                await_response_until(session, id, deadline_ms, method)

              {%{"result" => result}, deferred_messages} ->
                {:ok, defer_messages(session, deferred_messages), result}

              {%{"error" => error}, _deferred_messages} ->
                {:error, {:app_server_request_failed, method, error}}
            end

          {:error, reason} ->
            {:error, reason}
        end

      {port, {:exit_status, status}} when port == session.port ->
        {:error, {:worker_exit, status}}
    after
      remaining ->
        {:error, {:timeout, id}}
    end
  end

  defp response_timeout(%{initialize_timeout_ms: timeout_ms})
       when is_integer(timeout_ms) and timeout_ms > 0 do
    timeout_ms
  end

  defp response_timeout(_attrs), do: @initialize_timeout

  defp take_response(messages, id) do
    case Enum.split_while(messages, &(not response_message?(&1, id))) do
      {_before_response, []} ->
        nil

      {before_response, [response | after_response]} ->
        {response, before_response ++ after_response}
    end
  end

  defp response_message?(message, id) do
    Map.get(message, "id") == id and
      (Map.has_key?(message, "result") or Map.has_key?(message, "error"))
  end

  defp defer_messages(session, []), do: session

  defp defer_messages(session, messages) do
    deferred =
      messages
      |> Enum.map_join("", &(Jason.encode!(&1) <> "\n"))

    %{session | buffer: deferred <> session.buffer}
  end

  defp decode_session_messages(session) do
    with {:ok, messages, rest} <- decode_buffer(session.buffer) do
      _ = append_rpc_log_entries(Map.get(session, :raw_log_path), "inbound", messages)
      {:ok, %{session | buffer: rest}, messages}
    end
  end

  defp decode_complete_lines(lines) do
    Enum.reduce_while(lines, {:ok, []}, fn line, {:ok, messages} ->
      case Jason.decode(line) do
        {:ok, decoded} ->
          {:cont, {:ok, messages ++ [decoded]}}

        {:error, reason} ->
          {:halt, {:error, {:invalid_worker_message, line, reason}}}
      end
    end)
  end

  defp send_json(%{port: port} = session, payload) do
    _ = append_rpc_log_entry(Map.get(session, :raw_log_path), "outbound", payload)
    send_json(port, payload)
  end

  defp send_json(port, payload) do
    encoded = Jason.encode!(payload)
    Port.command(port, encoded <> "\n")
    :ok
  rescue
    error -> {:error, error}
  end

  defp default_log_dir(workspace) do
    Path.join([workspace, ".symphony", "worker"])
  end

  defp session_log_paths(attrs) do
    case Map.get(attrs, :log_dir) do
      nil ->
        attrs
        |> Map.take(@log_path_keys)
        |> Enum.into(%{})

      log_dir ->
        log_paths(:worker, log_dir)
        |> Keyword.merge(
          attrs
          |> Map.take(@log_path_keys)
          |> Enum.into([])
        )
        |> Enum.into(%{})
    end
  end

  defp prompt_log_paths(opts) do
    case Keyword.get(opts, :log_dir) do
      nil ->
        %{}

      log_dir ->
        :review
        |> merge_log_paths(log_dir, opts)
        |> Enum.into(%{})
    end
  end

  defp merge_log_paths(kind, log_dir, opts) do
    kind
    |> log_paths(log_dir)
    |> Keyword.merge(Keyword.take(opts, [:output_path, :prompt_path, :raw_log_path, :meta_path]))
  end

  defp prepare_session_logs(%{log_dir: log_dir} = paths, attrs) do
    metadata =
      %{
        runtime: "app_server",
        command: format_run_command(local_run_spec(attrs)),
        started_at: DateTime.utc_now() |> DateTime.to_iso8601(),
        workspace: Map.get(attrs, :workspace),
        workflow_path: Map.get(attrs, :workflow_path)
      }
      |> Map.merge(Map.get(attrs, :metadata, %{}))
      |> Map.put(:status, "starting")

    with :ok <- File.mkdir_p(log_dir),
         :ok <- maybe_write_prompt(paths, Map.get(attrs, :prompt)),
         :ok <- File.write(paths.raw_log_path, ""),
         :ok <- write_metadata_file(paths.meta_path, metadata) do
      :ok
    end
  end

  defp prepare_session_logs(_paths, _attrs), do: :ok

  defp prepare_prompt_logs(%{log_dir: log_dir} = paths, session, prompt, opts) do
    metadata =
      %{
        runtime: "app_server",
        thread_id: session.thread_id,
        timeout_ms: Keyword.get(opts, :timeout_ms, @turn_timeout)
      }
      |> maybe_put_attr(:command, Map.get(session, :command))
      |> Map.merge(Keyword.get(opts, :metadata, %{}))

    with :ok <- File.mkdir_p(log_dir),
         :ok <- File.write(paths.prompt_path, prompt),
         :ok <- ensure_log_file(paths.raw_log_path),
         :ok <- update_metadata(paths, metadata) do
      :ok
    end
  end

  defp prepare_prompt_logs(_paths, _session, _prompt, _opts), do: :ok

  defp write_prompt_output(%{output_path: output_path}, output) do
    File.write(output_path, String.trim(output))
  end

  defp write_prompt_output(_paths, _output), do: :ok

  defp finish_prompt_metadata(%{meta_path: _meta_path} = paths, updates) do
    update_metadata(paths, updates, finished: true)
  end

  defp finish_prompt_metadata(_paths, _updates), do: :ok

  defp maybe_write_prompt(_paths, nil), do: :ok
  defp maybe_write_prompt(_paths, ""), do: :ok
  defp maybe_write_prompt(paths, prompt), do: File.write(paths.prompt_path, prompt)

  defp ensure_log_file(path) do
    if File.exists?(path), do: :ok, else: File.write(path, "")
  end

  defp update_metadata(paths, updates, opts \\ [])

  defp update_metadata(%{meta_path: meta_path}, updates, opts) do
    metadata =
      read_metadata(meta_path)
      |> Map.merge(stringify_keys(updates))
      |> maybe_put_finished_at(Keyword.get(opts, :finished, false))

    write_metadata_file(meta_path, metadata)
  end

  defp update_metadata(_paths, _updates, _opts), do: :ok

  defp read_metadata(meta_path) do
    case File.read(meta_path) do
      {:ok, contents} ->
        case Jason.decode(contents) do
          {:ok, decoded} -> decoded
          {:error, _reason} -> %{}
        end

      {:error, _reason} ->
        %{}
    end
  end

  defp maybe_put_finished_at(metadata, true) do
    Map.put(metadata, "finished_at", DateTime.utc_now() |> DateTime.to_iso8601())
  end

  defp maybe_put_finished_at(metadata, false), do: metadata

  defp maybe_put_attr(map, _key, nil), do: map
  defp maybe_put_attr(map, _key, ""), do: map
  defp maybe_put_attr(map, key, value), do: Map.put(map, key, value)

  defp write_metadata_file(meta_path, metadata) do
    File.write(meta_path, Jason.encode!(stringify_keys(metadata), pretty: true))
  end

  defp append_rpc_log_entries(nil, _direction, _messages), do: :ok
  defp append_rpc_log_entries(_path, _direction, []), do: :ok

  defp append_rpc_log_entries(path, direction, messages) do
    lines =
      Enum.map_join(messages, "", fn message ->
        Jason.encode!(%{"direction" => direction, "message" => message}) <> "\n"
      end)

    File.write(path, lines, [:append])
  end

  defp append_rpc_log_entry(nil, _direction, _message), do: :ok

  defp append_rpc_log_entry(path, direction, message) do
    File.write(path, Jason.encode!(%{"direction" => direction, "message" => message}) <> "\n", [
      :append
    ])
  end

  defp format_run_command(spec) do
    Enum.join([spec.command | spec.args], " ")
  end

  defp stringify_keys(map) do
    Map.new(map, fn {key, value} -> {to_string(key), value} end)
  end
end
