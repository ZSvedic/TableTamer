> Historical template — phase 4 implemented V1 from the four per-surface spec docs (`core.md`, `runner.md`, `headless.md`, `cli.md`). Phase 5 consolidated those into [spec/behavior.md](../../spec/behavior.md) and [spec/code-contract.md](../../spec/code-contract.md). The instructions below preserve the phase-4 process for the record; substitute the consolidated docs anywhere the old per-surface filenames appear.

Read [writing-style.md](../writing-style.md) first (in case any spec needs follow-up clarification), then [conventions.md](../conventions.md), the spec hub at [spec/spec.md](../../spec/spec.md), the V1 contract ([behavior.md](../../spec/behavior.md) + [code-contract.md](../../spec/code-contract.md)), and [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md) for the Q1–Q15 decisions. The step defs at [src/tests/](../../src/tests/) are the executable target — every symbol they import must resolve to a working implementation.

Then execute the backlog in [phase-4-imp-cli.md](../phases/phase-4-imp-cli.md) to turn V1 red into green.

Process:
- Execute backlog items in order: core → headless → cli → cancellation tests → green run.
- After each item, run the relevant cucumber profile (or narrow with `--name "..."`) and briefly summarize what passed and what's still red.
- Implement only what the spec describes. If a spec is genuinely ambiguous, surface the question — and once it's answered, the answer goes back into the spec before the code does.
- Don't modify step defs to fit your implementation. The step defs are the contract; the implementation moves to fit them.
- New dependencies must honor [bunfig.toml](../../src/bunfig.toml)'s `minimumReleaseAge = 604800` (7 days). Verify with `bun pm` before installing.
- The LLM API key is read from `ANTHROPIC_API_KEY`. If missing, the harness exits with a clear message rather than a stack trace.

Out of scope for this session:
- V2 features (`group`, `join`, `Expr.sql`, web app, CSV-out, DuckDB, voice).
- `@web`-tagged scenarios.
- Modifying [conventions.md](../conventions.md), [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md), [spec/behavior.md](../../spec/behavior.md), [spec/code-contract.md](../../spec/code-contract.md), or [writing-style.md](../writing-style.md) without explicit instruction.

If everything is clear, please confirm before executing.
