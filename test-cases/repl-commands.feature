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
