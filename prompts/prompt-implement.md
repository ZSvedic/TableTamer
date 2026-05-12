Read [writing-style.md](../spec/writing-style.md) first (in case any spec needs follow-up clarification), then [conventions.md](../conventions.md), the spec hub at [spec/spec.md](../spec/spec.md), the four V1 sub-docs ([core.md](../spec/core.md), [runner.md](../spec/runner.md), [headless.md](../spec/headless.md), [cli.md](../spec/cli.md)), [data-model.md](../spec/data-model.md), and [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md) for the Q1–Q15 decisions. The step defs at [test-cases/step-defs/](../test-cases/step-defs/) are the executable target — every symbol they import must resolve to a working implementation.

Then execute the backlog in [phase-4-imp-cli.md](../phases/phase-4-imp-cli.md) to turn V1 red into green.

Process:
- Execute backlog items in order: core → headless → cli → cancellation tests → green run.
- After each item, run the relevant cucumber profile (or narrow with `--name "..."`) and briefly summarize what passed and what's still red.
- Implement only what the spec describes. If a spec is genuinely ambiguous, surface the question — and once it's answered, the answer goes back into the spec before the code does.
- Don't modify step defs to fit your implementation. The step defs are the contract; the implementation moves to fit them.
- New dependencies must honor [bunfig.toml](../bunfig.toml)'s `minimumReleaseAge = 604800` (7 days). Verify with `bun pm` before installing.
- The LLM API key is read from `ANTHROPIC_API_KEY`. If missing, the harness exits with a clear message rather than a stack trace.

Out of scope for this session:
- V2 features (`group`, `join`, `Expr.sql`, web app, CSV-out, DuckDB, voice).
- `@web`-tagged scenarios.
- Modifying [conventions.md](../conventions.md), [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md), [data-model.md](../spec/data-model.md), [writing-style.md](../spec/writing-style.md), or the four V1 sub-docs without explicit instruction.

If everything is clear, please confirm before executing.
