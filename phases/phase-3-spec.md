# Phase 3 — Spec (API documents)

Goal: write V1 API specification documents under [spec/](../spec/). No code in this phase — phase 4 implements against these specs. The symbols phase 2 surfaced (types, I/O, runner factories) get described as semantics, not as TypeScript signatures.

Prerequisites: Q1–Q15 in [phase-1-pre-spec.md](phase-1-pre-spec.md), the wire model in [data-model.md](../spec/data-model.md), the step-def usage in [test-cases/step-defs/](../test-cases/step-defs/) as the API-surface inventory.

## Backlog

1. **`spec/api-core.md`** — types (`Spec`, `Row`, `Transformation`, `Expr` — V1 subset) and I/O (`loadCsv`, `readJsonl`, `writeJsonl`): semantics, validation rules (Zod, per Q9), edge cases, errors. Lifts from [data-model.md](../spec/data-model.md) and narrows to V1.

2. **`spec/api-runner.md`** — the `Runner` contract: lifecycle (load → request → export), state model, error and cancellation semantics. Promotes the sketch in [world.ts](../test-cases/step-defs/world.ts) to authoritative form.

3. **`spec/api-headless.md`** — `createHeadlessRunner`: harness components per Q11, system-prompt structure per Q14, chunk/cancel semantics per Q10, error-recovery loop per Q9.

4. **`spec/api-cli.md`** — `createCliRunner` (REPL per Q1) and `runCli` (the `tabletamer execute <flow>` subcommand per Q7/Q15). Includes `.flow` file format and exit codes.

## Definition of done
- Every symbol referenced in [test-cases/step-defs/](../test-cases/step-defs/) has a defining section in one of the four docs.
- Each doc describes *what*, not *how* — no TypeScript code beyond what [data-model.md](../spec/data-model.md) already shows.
- Cross-references to [data-model.md](../spec/data-model.md) and [phase-1-pre-spec.md](phase-1-pre-spec.md) Q-answers where applicable; no duplication, no contradictions.
- No changes to [packages/](../packages/) or [test-cases/](../test-cases/) — those are phase 4.
