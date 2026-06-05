defmodule Symphony1.Core.Retry do
  @moduledoc false

  @default_base_delay_ms 100
  @default_max_attempts 3
  @default_max_delay_ms 1_000

  @type context :: %{
          attempt: pos_integer(),
          max_attempts: pos_integer(),
          next_delay_ms: non_neg_integer() | nil
        }

  @type retry_if :: (term(), context() -> boolean())
  @type sleeper :: (non_neg_integer() -> term())

  @spec run((-> {:ok, term()} | {:error, term()}), keyword()) :: {:ok, term()} | {:error, term()}
  def run(operation, opts \\ []) when is_function(operation, 0) do
    max_attempts = positive_integer_option(opts, :max_attempts, @default_max_attempts)
    base_delay_ms = non_negative_integer_option(opts, :base_delay_ms, @default_base_delay_ms)
    max_delay_ms = non_negative_integer_option(opts, :max_delay_ms, @default_max_delay_ms)
    retry_if = Keyword.get(opts, :retry_if, fn _reason, _context -> false end)
    sleeper = Keyword.get(opts, :sleeper, &Process.sleep/1)

    do_run(operation, retry_if, sleeper, 1, max_attempts, base_delay_ms, max_delay_ms)
  end

  defp do_run(operation, retry_if, sleeper, attempt, max_attempts, base_delay_ms, max_delay_ms) do
    case operation.() do
      {:ok, _result} = ok ->
        ok

      {:error, reason} = error ->
        next_delay_ms =
          if attempt < max_attempts do
            backoff_delay_ms(attempt, base_delay_ms, max_delay_ms)
          end

        context = %{
          attempt: attempt,
          max_attempts: max_attempts,
          next_delay_ms: next_delay_ms
        }

        if attempt < max_attempts and retry_if.(reason, context) do
          sleeper.(next_delay_ms)

          do_run(
            operation,
            retry_if,
            sleeper,
            attempt + 1,
            max_attempts,
            base_delay_ms,
            max_delay_ms
          )
        else
          error
        end
    end
  end

  defp backoff_delay_ms(attempt, base_delay_ms, max_delay_ms) do
    scaled_delay_ms = :erlang.bsl(base_delay_ms, attempt - 1)
    min(max_delay_ms, scaled_delay_ms)
  end

  defp positive_integer_option(opts, key, default) do
    case Keyword.get(opts, key, default) do
      value when is_integer(value) and value > 0 -> value
      _other -> default
    end
  end

  defp non_negative_integer_option(opts, key, default) do
    case Keyword.get(opts, key, default) do
      value when is_integer(value) and value >= 0 -> value
      _other -> default
    end
  end
end
