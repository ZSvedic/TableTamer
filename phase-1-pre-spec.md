## Open Questions

The plan is to first develop a CLI app in order to use less tokens and to iterate faster. 
Questions:

 1. Q: Is it better to develop an interactive TTY app, or a simple stdin/stdout app?  
    TTY would be more like a GUI app, while stdin/stdout app would be simpler and faster to iterate.  

    A: stdin/stdout REPL.  
    Cheap tokens, fast iteration, trivial to drive from Gherkin scenarios via piped input.  
    Cell editing, scrolling, and column changes are not replicated as TUI interactions — they become spec patches driven by natural language, matching the `(spec, row_stream)` wire in [data-model.md](data-model.md).  
    The transport is additive: a TTY or web renderer can be layered on the same protocol later.  
    See [Q1 details](#q1--stdinstdout-best-practices).  
    
 2. Q: Which library should be used for text input/output?  

    A: TypeScript stack.  
    Input: `node:readline/promises` (stdlib, history + editing, zero deps).  
    LLM: Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) — start with Anthropic native for prompt caching; swap in `@ai-sdk/openai` or `@openrouter/ai-sdk-provider` later with a one-line model change.  
    Spec edits: `fast-json-patch` (RFC 6902); JSON Merge Patch hand-rolled (~20 lines).  
    CSV I/O: `csv-parse` / `csv-stringify`; table rendering hand-rolled (~30 lines `padEnd`); validation via `zod` (transitive via `ai`); DuckDB deferred until row counts justify it.  
    Verified footprint: **5 direct deps, 11 total packages, 25 MB**.  
    See [Q2 details](#q2--mvp-typescript-stack).  

 3. Q: Should test-cases in Gherkin `.feature` files be separate for headless/CLI/web, or one Scenario can cover multiple?  
    Headless testing probably needs a separate Scenario, because specific API calls are made.  
    CLI/web can probably be combined in one Scenario because Gherkin actions can be "user says/selects/saves STR" and "display STR" which can be executed in both CLI/web.  

    A: 

 4. Q: Which is written first; the API spec or Gherkin files to test that API spec?  
    What is TDD's take on this?  

    A: 

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

## Answer details

### Q1 — stdin/stdout best practices

- **Cell editing → describe, not click.** User says `"normalize phone numbers"`; LLM emits a spec patch. Rare point-edits: `set row 12 col Phone "+15551234"` → JSON Patch.
- **Scrolling → paging commands.** `next` / `page 3` / `show 100` patches `page.offset`/`page.size`; runtime re-queries and reprints.
- **Sticky header → reprint each turn.** No terminal control codes. Same pattern as `sqlite3`, `psql`, `duckdb`, `jq` REPLs.
- **Column hide/reorder → spec patch**, already shown in [data-model.md](data-model.md).
- **Output:** default ASCII table (`tabulate`/`rich.table`); `--format=jsonl|csv` for piping.

Reframe: the CLI is a REPL that prints a fresh view per command, not a TUI spreadsheet. Interactions the LLM should absorb (cursor, scroll, in-cell edit) are deliberately not added — if they're needed, that's the signal to escalate to TTY or web, not bolt them onto stdin/stdout.

### Q2 — MVP TypeScript stack

| Role | Choice | Notes |
|---|---|---|
| Line input | `node:readline/promises` | stdlib, history + editing, 0 deps |
| LLM client | `ai` + `@ai-sdk/anthropic` | Vercel AI SDK; swap providers (`@ai-sdk/openai`, `@openrouter/ai-sdk-provider`) with one-line model change |
| JSON Patch (RFC 6902) | `fast-json-patch` | 0 transitive |
| Merge Patch (RFC 7396) | hand-rolled | ~20 lines |
| CSV read/write | `csv-parse`, `csv-stringify` | 0 transitive each |
| Schema validation | `zod` | transitive via `ai` |
| Table render | hand-rolled `padEnd` | ~30 lines; matches "REPL not TUI" reframe from Q1 |
| Query engine | in-memory JS arrays | DuckDB deferred; spec format unchanged when swapped in |

**Why TypeScript (not Python):** the web app is locked to TS/React/TanStack. Sharing spec types, patch logic, validation, and Anthropic-call code between CLI and web is the biggest single win for a solo project — one implementation, one test suite.

**Why Vercel AI SDK over alternatives:**
- vs OpenAI SDK + OpenRouter base URL: forced into OpenAI wire format, loses Anthropic-native prompt caching efficiency.
- vs LangChain JS: heavier and pulls in agent abstractions we don't need.
- vs hand-rolled `fetch`: reimplements streaming, retries, and tool-use schemas per provider.

**Prompt caching:** Anthropic-native via `cache_control` markers passed through `providerOptions.anthropic`. System prompt + spec schema + tool defs become the cached prefix → per-turn cost stays near the [data-model.md:62](data-model.md:62) ~1 KB constant.

**Footprint** (verified via clean `npm install`): 5 direct, 11 total, 25 MB.

