Read all documents in the project dir, especially [conventions.md](../conventions.md), [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md) for the Q1–Q15 decisions, [data-model.md](../spec/data-model.md) for the wire model, and the step defs under [test-cases/step-defs/](../test-cases/step-defs/) as the API-surface inventory.

Then execute the backlog in [phase-3-spec.md](../phases/phase-3-spec.md) to produce V1 API specification documents under [spec/](../spec/).

Process:
- Execute backlog items in order.
- After each item, briefly summarize what was written and ask before continuing.
- Write specs (semantics, edge cases, errors) — not code. No TypeScript signatures unless lifted directly from [data-model.md](../spec/data-model.md).
- V1 only: verbs `filter` / `mutate` / `select` / `sort`; `Expr = { js } | { llm; model? }`. No `sql`, `group`, or `join`.
- Cross-reference [data-model.md](../spec/data-model.md) and [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md) Q-answers; don't duplicate or contradict.
- Keep each spec doc concise — [data-model.md](../spec/data-model.md) length as the upper bound.

Out of scope for this session:
- Phase 4 implementation: code in [packages/](../packages/), removing the `any` stubs from [packages/*/src/index.ts](../packages/), etc.
- Modifying [conventions.md](../conventions.md), [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md), or [data-model.md](../spec/data-model.md) unless explicitly asked.
- Step defs, fixtures, Gherkin features.

If everything is clear, please confirm before executing.
