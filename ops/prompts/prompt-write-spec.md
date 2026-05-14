Read [writing-style.md](../writing-style.md) first — it is the voice and structure guide for every doc you write in this phase. Then read everything else in the project dir, especially [conventions.md](../conventions.md), [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md) for the Q1–Q15 decisions, [data-model.md](../../spec/data-model.md) for the wire model, [spec.md](../../spec/spec.md) as the spec set index, and the step defs under [src/tests/](../../src/tests/) as the API-surface inventory.

Then execute the backlog in [phase-3-spec.md](../phases/phase-3-spec.md) to produce V1 specification documents under [spec/](../../spec/).

Process:
- Execute backlog items in order.
- After each item, briefly summarize what was written and ask before continuing.
- Follow [writing-style.md](../writing-style.md) for voice, structure, and size (40–80 lines per sub-doc).
- Write specs (semantics, edge cases, errors) — not code. No TypeScript signatures unless lifted directly from [data-model.md](../../spec/data-model.md).
- V1 only: verbs `filter` / `mutate` / `select` / `sort`; `Expr = { js } | { llm; model? }`. No `sql`, `group`, or `join`.
- Cross-reference [data-model.md](../../spec/data-model.md) and [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md) Q-answers where applicable; don't duplicate or contradict.

Out of scope for this session:
- Phase 4 implementation: code in [src/packages/](../../src/packages/), removing the `any` stubs from [src/packages/*/index.ts](../../src/packages/), etc.
- Modifying [conventions.md](../conventions.md), [phase-1-pre-spec.md](../phases/phase-1-pre-spec.md), [data-model.md](../../spec/data-model.md), or [writing-style.md](../writing-style.md) unless explicitly asked.
- Step defs, fixtures, Gherkin features.

If everything is clear, please confirm before executing.
