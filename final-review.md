# Final project review

Audit before phase 4 implementation. Each tracked file is judged on:

1. **Consistent** with the rest of the project (terminology, decisions, file naming, cross-references).
2. **Simplified** — can the file be cut, trimmed, or merged?
3. **Reason for existence** — what role it plays.

Files fixed during this audit are noted as *"fixed in this audit"* under **Consistent**. Excluded from the table: [bun.lock](bun.lock) (generated dependency snapshot).

| File | Consistent | Simplified | Reason for existence |
|---|---|---|---|
| [.gitignore](.gitignore) | Yes | Yes | Excludes `node_modules`, runtime `*-output.*` fixtures, and macOS `.DS_Store`. |
| [LICENSE](LICENSE) | Yes | Yes | Standard MIT license. |
| [TESTING.md](TESTING.md) | Yes | Yes | One-page guide to running cucumber profiles and the type-only red check. |
| [bunfig.toml](bunfig.toml) | Yes | Yes | Enforces `minimumReleaseAge = 604800` (7 days) per [phase-1 Q2](phases/phase-1-pre-spec.md). |
| [conventions.md](conventions.md) | **No: "Under `specs/`" was the wrong path — fixed in this audit (now points at `spec/` plus the hub and style guide).** | Yes | Project-level stack and tooling conventions, plus the phase index. |
| [cucumber.js](cucumber.js) | Yes | Yes | Cucumber config with `headless` and `cli` profiles, each tag-filtered. |
| [final-review.md](final-review.md) | **New — created in this audit.** | Yes | This document. |
| [package.json](package.json) | Yes | Yes | Workspace root + `test:red` script. |
| [packages/cli/package.json](packages/cli/package.json) | Yes | Yes | `@tabletamer/cli` metadata, `tabletamer` bin, deps on core + headless. |
| [packages/cli/src/index.ts](packages/cli/src/index.ts) | Yes (red-phase `any` stub by design) | Yes | Placeholder for `createCliRunner` and `runCli`; phase 4 fills per [cli.md](spec/cli.md). |
| [packages/core/package.json](packages/core/package.json) | **No: `fast-json-patch` belongs in headless — only the LLM harness applies patches — moved in this audit.** | Yes | `@tabletamer/core` metadata; deps on `csv-parse`, `csv-stringify`, `zod`. |
| [packages/core/src/index.ts](packages/core/src/index.ts) | Yes (red-phase `any` stub by design) | Yes | Placeholder for `Row`, `Spec`, `readJsonl`; phase 4 fills per [core.md](spec/core.md). |
| [packages/headless/package.json](packages/headless/package.json) | Yes (after the fast-json-patch move in this audit) | Yes | `@tabletamer/headless` metadata; deps on `ai`, `@ai-sdk/anthropic`, `fast-json-patch`, core. |
| [packages/headless/src/index.ts](packages/headless/src/index.ts) | Yes (red-phase `any` stub by design) | Yes | Placeholder for `createHeadlessRunner`; phase 4 fills per [headless.md](spec/headless.md). |
| [phases/phase-1-pre-spec.md](phases/phase-1-pre-spec.md) | Yes | Yes | Q1–Q15 architecture-decisions audit trail. Specs cite these Qs — intentional duplication. |
| [phases/phase-2-tests.md](phases/phase-2-tests.md) | Yes | Yes | Phase-2 backlog: TDD red scaffold (runner, packages, fixtures, step defs). |
| [phases/phase-3-spec.md](phases/phase-3-spec.md) | Yes | Yes | Phase-3 backlog: the four V1 sub-spec docs. |
| [phases/phase-4-imp-cli.md](phases/phase-4-imp-cli.md) | **Was empty (just `ToDo`) — filled in this audit.** | Yes | Phase-4 backlog: implement V1 to make tests green. |
| [prompts/prompt-implement.md](prompts/prompt-implement.md) | **New — created in this audit.** | Yes | Drives phase 4 (implementation). |
| [prompts/prompt-meeting.md](prompts/prompt-meeting.md) | **No: typo "everyhting" — fixed in this audit.** | Yes | Drives the time-boxed Q&A meeting workflow (used to author phase-1 Q-answers). |
| [prompts/prompt-test.md](prompts/prompt-test.md) | Yes | Yes | Drives phase 2 (red-phase tests). |
| [prompts/prompt-write-spec.md](prompts/prompt-write-spec.md) | Yes | Yes | Drives phase 3 (write spec docs). |
| [research-links.md](research-links.md) | Yes | Yes | Personal-reference notes on name origin and library evaluations. Moved to root from `spec/` so it doesn't appear in the public spec set. |
| [spec/cli.md](spec/cli.md) | Yes | Yes | V1 spec for the CLI: REPL + `execute <flow>` subcommand. |
| [spec/core.md](spec/core.md) | Yes | Yes | V1 spec for core types and I/O. |
| [spec/data-model.md](spec/data-model.md) | Yes | Yes | The wire model: Spec + Patches. Cited by every sub-doc — intentional duplication. |
| [spec/headless.md](spec/headless.md) | Yes | Yes | V1 spec for the headless LLM harness. |
| [spec/rationale.md](spec/rationale.md) | Yes | Yes | What TableTamer is and why. Style anchor for the spec set. |
| [spec/runner.md](spec/runner.md) | Yes | Yes | V1 spec for the surface-agnostic Runner contract. |
| [spec/spec.md](spec/spec.md) | Yes | Yes | Hub: one-line role per sub-doc plus a link to the phase-1 decisions. |
| [spec/writing-style.md](spec/writing-style.md) | Yes | Yes | Style guide that governs every doc under `spec/`. |
| [test-cases/aggregate.feature](test-cases/aggregate.feature) | Yes | Yes | V2 stub: 1-line TODO for group + aggregate. |
| [test-cases/cancelation.feature](test-cases/cancelation.feature) | **Partial: V1 scenarios written but not yet in [cucumber.js](cucumber.js) paths.** Tracked as item 4 in [phase-4-imp-cli.md](phases/phase-4-imp-cli.md). | Yes | V1 cross-cutting scenarios: AbortSignal + revert semantics. |
| [test-cases/colsplit.feature](test-cases/colsplit.feature) | Yes | Yes | V2 stub: 1-line TODO for column split / merge. |
| [test-cases/convert.feature](test-cases/convert.feature) | Yes | Yes | V2 stub: 1-line TODO for format conversion. |
| [test-cases/datanorm-expected.jsonl](test-cases/datanorm-expected.jsonl) | Yes | Yes | Golden output for datanorm.feature. |
| [test-cases/datanorm-input.csv](test-cases/datanorm-input.csv) | Yes | Yes | Source fixture for datanorm.feature (20 rows; unicode + mixed phone/date formats). |
| [test-cases/datanorm.feature](test-cases/datanorm.feature) | Yes | Yes | V1: field normalization (phone, country, DOB). |
| [test-cases/dedupe-expected.jsonl](test-cases/dedupe-expected.jsonl) | Yes | Yes | Golden output for dedupe.feature. |
| [test-cases/dedupe-input.csv](test-cases/dedupe-input.csv) | Yes | Yes | Source fixture for dedupe.feature (Email duplicates). |
| [test-cases/dedupe.feature](test-cases/dedupe.feature) | Yes | Yes | V1: deduplication by Email. |
| [test-cases/filter-expected.jsonl](test-cases/filter-expected.jsonl) | Yes | Yes | Golden output for filter.feature. |
| [test-cases/filter-input.csv](test-cases/filter-input.csv) | Yes | Yes | Source fixture for filter.feature (varied Country values). |
| [test-cases/filter.feature](test-cases/filter.feature) | Yes | Yes | V1: filter by Country. |
| [test-cases/join.feature](test-cases/join.feature) | Yes | Yes | V2 stub: 1-line TODO for lookup join. |
| [test-cases/pivot.feature](test-cases/pivot.feature) | Yes | Yes | V2 stub: 1-line TODO for pivot/unpivot. |
| [test-cases/sort.feature](test-cases/sort.feature) | Yes | Yes | V2 stub: 1-line TODO for sort + top-N. |
| [test-cases/step-defs/cli.hooks.ts](test-cases/step-defs/cli.hooks.ts) | Yes | Yes | Per-tag `Before` hook binding `createCliRunner` to `@cli` scenarios. |
| [test-cases/step-defs/common.steps.ts](test-cases/step-defs/common.steps.ts) | Yes | Yes | Shared Given/When/Then steps used across V1 features. |
| [test-cases/step-defs/headless.hooks.ts](test-cases/step-defs/headless.hooks.ts) | Yes | Yes | Per-tag `Before` hook binding `createHeadlessRunner` to `@headless` scenarios. |
| [test-cases/step-defs/world.ts](test-cases/step-defs/world.ts) | Yes | Yes | `TableTamerWorld` + the `Runner` interface; phase 3 promoted Runner to the spec. |
| [test-cases/validate.feature](test-cases/validate.feature) | Yes | Yes | V2 stub: 1-line TODO for validation/audit. |
| [tsconfig.json](tsconfig.json) | Yes | Yes | Strict TS6, ES2022, bundler resolution, no emit. |

## Follow-ups for phase 4
- Wire [cancelation.feature](test-cases/cancelation.feature) into [cucumber.js](cucumber.js) and write the missing step defs (item 4 in [phase-4-imp-cli.md](phases/phase-4-imp-cli.md)).
- After the fast-json-patch dep move, run `bun install` to refresh [bun.lock](bun.lock).

## Intentional duplications kept
- Q1–Q15 decisions in [phase-1-pre-spec.md](phases/phase-1-pre-spec.md) are re-stated as contracts in [spec/](spec/) (e.g. the system-prompt token table appears in both Q14 and [headless.md](spec/headless.md)). Discussion in phases, contract in spec.
- The wire model in [data-model.md](spec/data-model.md) is re-stated narrowly for V1 in [core.md](spec/core.md). The wire doc is forward-looking; core narrows to V1.
- The cancellation timing ("within 2 seconds") shows up in [cancelation.feature](test-cases/cancelation.feature), [runner.md](spec/runner.md), [headless.md](spec/headless.md), and [cli.md](spec/cli.md) — same constraint stated at every level it applies, intentionally.
