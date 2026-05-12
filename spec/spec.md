# TableTamer specs

- [Writing style](writing-style.md) — conventions for everything in this directory.
- [Data model](data-model.md) — the wire format: spec + patches.
- [Rationale](rationale.md) — what TableTamer is and why.
- [Architecture decisions](../phases/phase-1-pre-spec.md) — Q1–Q15 audit trail behind the spec.

## API

- [Core](core.md) — wire types (`Spec`, `Row`, `Transformation`, `Expr`) and file I/O (`loadCsv`, `readJsonl`, `writeJsonl`).
- [Runner](runner.md) — the object step definitions drive; same methods on CLI and headless.
- [Headless](headless.md) — `createHeadlessRunner()`: the LLM harness.
- [CLI](cli.md) — `createCliRunner()` + `runCli()`: REPL and the `execute <flow>` subcommand.
