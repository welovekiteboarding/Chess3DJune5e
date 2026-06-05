defmodule Symphony1.RuntimeConfig do
  @moduledoc false

  @missing_linear_api_key_message """
  LINEAR_API_KEY is required for this command. Set it in your shell or environment before running Symphony against Linear.
  """

  @missing_linear_team_key_message """
  A Linear team key is required for this command. Set the setup intent team key or pass --team-key when the command supports it.
  """

  @spec linear_api_key(keyword()) :: {:ok, String.t()} | {:error, :missing_linear_api_key}
  def linear_api_key(opts \\ []) do
    case Keyword.get(opts, :linear_api_key, System.get_env("LINEAR_API_KEY")) do
      nil -> {:error, :missing_linear_api_key}
      "" -> {:error, :missing_linear_api_key}
      value -> {:ok, value}
    end
  end

  @spec linear_api_key!(keyword()) :: String.t()
  def linear_api_key!(opts \\ []) do
    case linear_api_key(opts) do
      {:ok, value} -> value
      {:error, :missing_linear_api_key} -> raise @missing_linear_api_key_message
    end
  end

  @spec linear_config(term(), keyword()) ::
          {:ok, %{api_key: String.t(), team_key: String.t()}}
          | {:error, :missing_linear_api_key | :missing_linear_team_key}
  def linear_config(team_key, _opts \\ [])

  def linear_config(team_key, _opts) when team_key in [nil, ""],
    do: {:error, :missing_linear_team_key}

  def linear_config(team_key, opts) when is_binary(team_key) do
    case Keyword.get(opts, :linear_config) do
      %{api_key: _api_key, team_key: ^team_key} = config ->
        {:ok, config}

      %{api_key: _api_key, team_key: other_team_key} = config when is_binary(other_team_key) ->
        {:ok, config}

      nil ->
        with {:ok, api_key} <- linear_api_key(opts) do
          {:ok, %{api_key: api_key, team_key: team_key}}
        end
    end
  end

  def linear_config(_team_key, _opts), do: {:error, :missing_linear_team_key}

  @spec linear_config!(String.t(), keyword()) :: %{api_key: String.t(), team_key: String.t()}
  def linear_config!(team_key, opts \\ []) do
    case linear_config(team_key, opts) do
      {:ok, config} -> config
      {:error, :missing_linear_api_key} -> raise @missing_linear_api_key_message
      {:error, :missing_linear_team_key} -> raise @missing_linear_team_key_message
    end
  end

  @spec missing_linear_api_key_message() :: String.t()
  def missing_linear_api_key_message do
    @missing_linear_api_key_message |> String.trim()
  end
end
