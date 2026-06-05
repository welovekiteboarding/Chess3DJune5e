defmodule Mix.Tasks.Symphony.ServiceInstall do
  use Mix.Task

  alias Symphony1.RuntimeConfig
  alias Symphony1.Service.Launchd

  @shortdoc "Generate and install a launchd plist for mix symphony.operate"

  @label "com.symphony1.operate"
  @keychain_service_name "com.symphony1.operate.linear-api-key"
  @default_repo_local_dir "tmp/service"
  @default_launch_agents_dir Path.expand("~/Library/LaunchAgents")
  @default_security_path "/usr/bin/security"
  @default_shell_path "/bin/zsh"

  @impl true
  def run(args) do
    {opts, _positional, _invalid} =
      OptionParser.parse(args,
        strict: [graph: :string, team_key: :string, acknowledge_plaintext_secret_policy: :boolean]
      )

    graph_path =
      case Keyword.get(opts, :graph) do
        nil -> Mix.raise("usage: mix symphony.service_install --graph PATH --team-key KEY")
        path -> Path.expand(path)
      end

    team_key =
      case Keyword.get(opts, :team_key) do
        nil -> Mix.raise("usage: mix symphony.service_install --graph PATH --team-key KEY")
        key -> key
      end

    api_key =
      case RuntimeConfig.linear_api_key() do
        {:ok, key} ->
          key

        {:error, :missing_linear_api_key} ->
          Mix.raise(RuntimeConfig.missing_linear_api_key_message())
      end

    config = override_config()

    mix_resolver = Map.get(config, :mix_resolver, &System.find_executable/1)

    mix_path =
      case mix_resolver.("mix") do
        nil -> Mix.raise("could not resolve absolute path to mix")
        path -> path
      end

    working_directory = Map.get(config, :working_directory, File.cwd!())
    repo_local_dir = Map.get(config, :repo_local_dir, @default_repo_local_dir)
    launch_agents_dir = Map.get(config, :launch_agents_dir, @default_launch_agents_dir)
    file_writer = Map.get(config, :file_writer, &File.write/2)
    file_copier = Map.get(config, :file_copier, &File.cp/2)
    secret_installer = Map.get(config, :secret_installer, &install_keychain_secret/1)

    repo_local_path = Path.join(repo_local_dir, "#{@label}.plist")
    install_path = Path.join(launch_agents_dir, "#{@label}.plist")

    maybe_print_deprecated_acknowledgement_notice(opts)
    detect_legacy_plaintext_artifacts!(repo_local_path, install_path, graph_path, team_key)

    secret_handoff = %{
      type: :macos_keychain,
      shell_path: Map.get(config, :shell_path, @default_shell_path),
      security_path: Map.get(config, :security_path, @default_security_path),
      service_name: @keychain_service_name,
      account_name: working_directory
    }

    case secret_installer.(Map.put(secret_handoff, :api_key, api_key)) do
      :ok ->
        :ok

      {:ok, _result} ->
        :ok

      {:error, reason} ->
        Mix.raise(
          "service_install: failed to store LINEAR_API_KEY in macOS Keychain: #{inspect(reason)}"
        )
    end

    Mix.shell().info(
      "service_install: stored LINEAR_API_KEY in macOS Keychain service=#{secret_handoff.service_name} account=#{secret_handoff.account_name}"
    )

    plist_config = %{
      label: @label,
      mix_path: mix_path,
      graph_path: graph_path,
      team_key: team_key,
      working_directory: working_directory,
      stdout_log: Path.join(working_directory, "log/operate.stdout.log"),
      stderr_log: Path.join(working_directory, "log/operate.stderr.log"),
      env: %{
        "PATH" => System.get_env("PATH") || "/usr/bin:/bin"
      },
      secret_handoff: secret_handoff
    }

    plist_content = Launchd.generate_plist(plist_config)

    File.mkdir_p!(repo_local_dir)

    case file_writer.(repo_local_path, plist_content) do
      :ok ->
        Mix.shell().info("service_install: wrote #{repo_local_path}")

      {:error, reason} ->
        Mix.raise("service_install: failed to write repo-local plist: #{inspect(reason)}")
    end

    File.mkdir_p!(launch_agents_dir)

    case file_copier.(repo_local_path, install_path) do
      :ok ->
        Mix.shell().info("service_install: installed #{install_path}")

      {:error, reason} ->
        Mix.raise("service_install: failed to install plist to LaunchAgents: #{inspect(reason)}")
    end

    Mix.shell().info("service_install: next step — run mix symphony.service_start")
  end

  defp override_config do
    Application.get_env(:symphony_1, :service_install_config, %{})
  end

  defp maybe_print_deprecated_acknowledgement_notice(opts) do
    if Keyword.get(opts, :acknowledge_plaintext_secret_policy, false) do
      Mix.shell().info(
        "service_install: --acknowledge-plaintext-secret-policy is no longer needed; launchd install now uses macOS Keychain lookup instead of writing LINEAR_API_KEY into the plist"
      )
    end
  end

  defp detect_legacy_plaintext_artifacts!(repo_local_path, install_path, graph_path, team_key) do
    legacy_paths =
      [repo_local_path, install_path]
      |> Enum.filter(&legacy_plaintext_artifact?/1)

    if legacy_paths != [] do
      Mix.raise(
        legacy_plaintext_cleanup_message(legacy_paths, install_path, graph_path, team_key)
      )
    end
  end

  defp legacy_plaintext_artifact?(path) do
    case File.read(path) do
      {:ok, content} -> Launchd.legacy_plaintext_plist?(content)
      {:error, _reason} -> false
    end
  end

  defp legacy_plaintext_cleanup_message(legacy_paths, install_path, graph_path, team_key) do
    affected_paths =
      legacy_paths
      |> Enum.map(&"  - #{&1}")
      |> Enum.join("\n")

    remove_command =
      legacy_paths
      |> Enum.map(&shell_escape/1)
      |> Enum.join(" ")

    bootout_step =
      if install_path in legacy_paths do
        """
        1. Stop the loaded launch agent if it is still present:
           launchctl bootout gui/#{uid()} #{shell_escape(install_path)} || true

        """
      else
        ""
      end

    """
    service_install: existing plaintext launchd plist artifacts detected:
    #{affected_paths}

    These files were created by the old launchd installer that embedded LINEAR_API_KEY directly in the plist.
    Clean them up before reinstalling with the Keychain-backed handoff:

    #{bootout_step}2. Remove the plaintext plist artifact(s):
       rm -f #{remove_command}

    3. Reinstall the service:
       mix symphony.service_install --graph #{graph_path} --team-key #{team_key}
    """
    |> String.trim()
  end

  defp install_keychain_secret(secret) do
    args = [
      "add-generic-password",
      "-U",
      "-a",
      secret.account_name,
      "-s",
      secret.service_name,
      "-w",
      secret.api_key
    ]

    case System.cmd(secret.security_path, args, stderr_to_stdout: true) do
      {_output, 0} ->
        :ok

      {output, status} ->
        {:error, {:command_failed, "security", status, String.trim(output)}}
    end
  rescue
    error in ErlangError ->
      {:error, {:command_failed, "security", 1, Exception.message(error)}}
  end

  defp shell_escape(value) when is_binary(value) do
    "'" <> String.replace(value, "'", "'\"'\"'") <> "'"
  end

  defp uid, do: System.cmd("id", ["-u"]) |> elem(0) |> String.trim()
end
