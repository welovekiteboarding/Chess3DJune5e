defmodule Symphony1.Planning.ValidatorTest do
  use ExUnit.Case, async: true

  alias Symphony1.Planning.Graph
  alias Symphony1.Planning.Validator

  describe "validate_task_admission/2" do
    test "accepts code tasks that validate with mix check and npm run test:browser" do
      task = %Graph.Task{
        id: "allow-browser-test-validation-018",
        title: "Allow browser test validation command",
        description: "Allow a single browser-smoke-test validation command",
        acceptance_criteria: ["Graph.parse_task_command/1 accepts npm run test:browser"],
        dependencies: [],
        status: "pending",
        materialization: %Graph.Materialization{},
        kind: "code",
        validation: %Graph.Validation{
          commands: ["npm run test:browser", "mix check"],
          required: true
        }
      }

      assert Validator.validate_task_admission(task) == :ok
    end

    test "rejects code tasks that use unsupported npm scripts" do
      task = %Graph.Task{
        id: "reject-unsupported-script",
        title: "Reject unsupported npm validation scripts",
        description: "Keep the npm allowlist narrow",
        acceptance_criteria: ["Unsupported npm scripts remain rejected"],
        dependencies: [],
        status: "pending",
        materialization: %Graph.Materialization{},
        kind: "code",
        validation: %Graph.Validation{
          commands: ["npm run dev", "mix check"],
          required: true
        }
      }

      assert Validator.validate_task_admission(task) ==
               {:error,
                {:admission_failed, "reject-unsupported-script",
                 "validation.commands contains unsupported command: npm run dev (invalid npm script: dev)"}}
    end
  end
end
