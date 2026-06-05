defmodule Symphony1.Planning.GraphTest do
  use ExUnit.Case, async: true

  alias Symphony1.Planning.Graph

  describe "parse_task_command/1" do
    test "accepts npm run test:browser exactly" do
      assert Graph.parse_task_command("npm run test:browser") ==
               {:ok, {"npm", ["run", "test:browser"]}}
    end

    test "keeps existing npm validation commands accepted" do
      assert Graph.parse_task_command("npm run test -- --run") ==
               {:ok, {"npm", ["run", "test", "--", "--run"]}}
    end

    test "rejects unsupported npm scripts" do
      assert Graph.parse_task_command("npm run dev") ==
               {:error, {:invalid_task_command, "npm run dev", {:invalid_npm_script, "dev"}}}

      assert Graph.parse_task_command("npm run anythingelse") ==
               {:error,
                {:invalid_task_command, "npm run anythingelse",
                 {:invalid_npm_script, "anythingelse"}}}
    end
  end
end
