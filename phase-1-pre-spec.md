## Open Questions

The plan is to first develop a CLI app in order to use less tokens and to iterate faster. 
Questions:
 1. Is it better to develop an interactive TTY app, or a simple stdin/stdout app?
    TTY would be more like a GUI app, while stdin/stdout app would be simpler and faster to iterate.
 2. Which library should be used for text input/output?
 3. Should test-cases in Gherkin `.feature` files be separate for headless/CLI/web, or one Scenario can cover multiple?
    Headless testing probably needs a separate Scenario, because specific API calls are made.
    CLI/web can probably be combined in one Scenario because Gherkin actions can be "user says/selects/saves STR" and "display STR" which can be executed in both CLI/web.
 4. Which is written first; the API spec or Gherkin files to test that API spec?
    What is TDD's take on this?
 5. What is a list of top 10 ETL use cases for individual users?
    How to create test cases for them?
    Should test cases cover just the main path or errors and edge cases also?
    What is TDD's take on this?
 6. How many test cases for MVP is needed?
 7. What are the requirements for an MVP?
 8. Which data model should be used, that can be reused between headless/CLI/web?
 9. How will changes be handled by an LLM? 
    JSON Patches, diffs, or search/replace tool?
10. How will changes be propagates to UI (CLI and web)?
11. Should harness be written from scratch or forked from some simple exiting harness like 
    [SWE-agent](https://github.com/swe-agent/swe-agent)?
    What are the pros and cons of each?
12. Which tabular UI library should be used for the web app?
