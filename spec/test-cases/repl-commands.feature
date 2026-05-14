Feature: REPL slash commands

  The three commands the REPL handles locally without any LLM round-trip:
  /help echoes usage, /undo pops the last transformation, exit closes the loop.

  @cli @offline
  Scenario: /help echoes the usage screen in-session
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      /help
      exit
      """
    Then REPL exit code is 0
    And REPL stdout contains "Usage:"
    And REPL stdout contains "/undo"

  @cli @offline
  Scenario: exit closes the REPL with code 0
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      exit
      """
    Then REPL exit code is 0

  @cli @offline
  Scenario: /exit closes the REPL with code 0
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      /exit
      """
    Then REPL exit code is 0

  @cli @offline
  Scenario: /undo on a freshly loaded CSV says nothing to undo
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      /undo
      exit
      """
    Then REPL exit code is 0
    And REPL stdout contains "nothing to undo."

  @cli @offline
  Scenario: /save without a path prints usage
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      /save
      exit
      """
    Then REPL exit code is 0
    And REPL stdout contains "/save: missing path"

  @cli @offline
  Scenario: /save writes current rows to a JSONL file
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      /save ../temp/repl-save-output.jsonl
      exit
      """
    Then REPL exit code is 0
    And REPL stdout contains "saved"
    And "../temp/repl-save-output.jsonl" exists

  @cli @offline
  Scenario: /save-flow without a path prints usage
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      /save-flow
      exit
      """
    Then REPL exit code is 0
    And REPL stdout contains "/save-flow: missing path"

  @cli @offline
  Scenario: /save-flow writes a replayable flow file
    When user enters the REPL with "dedupe-input.csv" and types:
      """
      /save-flow ../temp/repl-save-flow-output.flow
      exit
      """
    Then REPL exit code is 0
    And REPL stdout contains "saved flow"
    And "../temp/repl-save-flow-output.flow" exists
