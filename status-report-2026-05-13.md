# Project cleanup — Status Report

**Date:** 2026-05-13

Project-wide consistency and simplification audit covering every file tracked in git (cache and package files excluded — they're in [.gitignore](.gitignore)). Each file is judged on:

1. **Consistent** with the rest of the project (terminology, decisions, file naming, cross-references).
2. **Simplified** — can the file be cut, trimmed, or merged? Intentional cross-doc duplications (Q1–Q15 decisions cited in spec; wire model narrowed in [core.md](spec/core.md); 2-second cancel deadline stated where it applies) are preserved as designed.
3. **Reason for existence** — what role it plays.

Files fixed in this audit are noted as *"fixed in this audit"* under **Consistent**.

| File | Consistent | Simplified | Reason for existence |
|---|---|---|---|
| [.gitignore](.gitignore) | **Yes — added `*-saved.*` in this audit so future `/save` / `/save-flow` test artifacts at the repo root don't get committed.** | Yes | Excludes `node_modules`, runtime `*-output.*` / `*-saved.*` artifacts, `.DS_Store`, and `.env*`. |
| [LICENSE](LICENSE) | Yes | Yes | Standard MIT license. |
| [README.md](README.md) | Yes | Yes | User-facing entry point: setup, env-var table, REPL + batch usage, known limitations. |
| [TESTING.md](TESTING.md) | **No — was still describing a pre-phase-4 "red check" workflow (`test:red`, "Both should be fully red until phase 4") that has been green for a session now. Rewritten in this audit.** | Yes | One-page guide to running cucumber profiles, the `@offline` subset, and the type-only check. |
| [bunfig.toml](bunfig.toml) | Yes | Yes | Enforces `minimumReleaseAge = 604800` per [phase-1 Q2](phases/phase-1-pre-spec.md). |
| [conventions.md](conventions.md) | Yes | Yes | Project-level stack, tooling, test-fixture naming, and phase index. |
| [cucumber.js](cucumber.js) | Yes | Yes | Cucumber config with `headless` and `cli` profiles; `TABLETAMER_FEATURES` env var narrows the feature set. |
| [package.json](package.json) | **No — `test:red` script was a byte-for-byte duplicate of `test` (kept as an alias during phase 4 per the backlog note). Removed in this audit.** | Yes | Workspace root + `test` / `test:offline` scripts. |
| [packages/cli/package.json](packages/cli/package.json) | Yes | Yes | `@tabletamer/cli` metadata, `tabletamer` bin, workspace deps on core + headless. |
| [packages/cli/src/index.ts](packages/cli/src/index.ts) | **No — imported `loadCsv`, `readJsonl`, `writeJsonl` from core but never referenced them. Pruned in this audit.** | Yes | `createCliRunner`, REPL, slash commands, `runCli`, and the `execute <flow>` subcommand. |
| [packages/cli/src/slash.test.ts](packages/cli/src/slash.test.ts) | Yes | Yes | bun-test coverage for the slash-command dispatcher. |
| [packages/core/package.json](packages/core/package.json) | **No — declared `csv-stringify` as a direct dep, but V1 only writes JSONL and the dep was never imported. Removed in this audit.** | Yes | `@tabletamer/core` metadata; deps on `csv-parse` + `zod`. |
| [packages/core/src/index.ts](packages/core/src/index.ts) | Yes | Yes | Types (`Spec`, `Row`, `Transformation`, `Expr`), the V1 Zod schema, `loadCsv` / `readJsonl` / `writeJsonl`, `loadEnv`. |
| [packages/headless/package.json](packages/headless/package.json) | **No — declared `zod` as a direct dep but never imports it directly (Zod schemas live in core, headless uses `jsonSchema` from `ai`). Removed in this audit.** | Yes | `@tabletamer/headless` metadata; deps on `ai`, `@ai-sdk/anthropic`, `fast-json-patch`, core. |
| [packages/headless/src/index.ts](packages/headless/src/index.ts) | Yes | Yes | `createHeadlessRunner`: conversation driver, `apply_spec_patch` tool, evaluator, chunk dispatcher, error-recovery loop. |
| [packages/headless/src/batch.test.ts](packages/headless/src/batch.test.ts) | Yes | Yes | bun-test coverage for `tryParseBatchResponse` (fence stripping, length checks, null coercion). |
| [packages/headless/src/plan.test.ts](packages/headless/src/plan.test.ts) | Yes | Yes | bun-test coverage for `computePlan` (column add/remove/reorder, transformation diff). |
| [phases/phase-1-pre-spec.md](phases/phase-1-pre-spec.md) | Yes | Yes | Q1–Q15 architecture-decision audit trail. Specs cite these Qs — intentional cross-doc duplication. |
| [phases/phase-2-tests.md](phases/phase-2-tests.md) | Yes | Yes | Phase-2 backlog: TDD red scaffold. |
| [phases/phase-3-spec.md](phases/phase-3-spec.md) | Yes | Yes | Phase-3 backlog: the four V1 sub-spec docs. |
| [phases/phase-4-imp-cli.md](phases/phase-4-imp-cli.md) | Yes | Yes | Phase-4 backlog: implementation that turned the suite green. |
| [prompts/prompt-cleanup.md](prompts/prompt-cleanup.md) | Yes | Yes | Drives this audit. |
| [prompts/prompt-implement.md](prompts/prompt-implement.md) | Yes | Yes | Drives phase 4 (implementation). |
| [prompts/prompt-meeting.md](prompts/prompt-meeting.md) | Yes | Yes | Drives the time-boxed Q&A meeting workflow (used for phase-1 answers and will be reused for V2). |
| [prompts/prompt-test.md](prompts/prompt-test.md) | Yes | Yes | Drives phase 2 (red-phase tests). |
| [prompts/prompt-write-spec.md](prompts/prompt-write-spec.md) | Yes | Yes | Drives phase 3 (write spec docs). |
| [research-links.md](research-links.md) | Yes | Yes | Personal-reference notes on name origin and library evaluations. |
| [spec/cli.md](spec/cli.md) | Yes | Yes | V1 spec for the CLI: REPL + `execute <flow>`. |
| [spec/core.md](spec/core.md) | Yes | Yes | V1 spec for core types and I/O. |
| [spec/data-model.md](spec/data-model.md) | **No — line 17 had a stray `x` at end of "...never to the LLM.x". Fixed in this audit.** | Yes | The wire model: Spec + Patches. Cited by every sub-doc — intentional cross-doc duplication. |
| [spec/headless.md](spec/headless.md) | Yes | Yes | V1 spec for the headless LLM harness. |
| [spec/rationale.md](spec/rationale.md) | Yes | Yes | What TableTamer is and why. Style anchor for the spec set. |
| [spec/runner.md](spec/runner.md) | Yes | Yes | V1 spec for the surface-agnostic Runner contract. |
| [spec/spec.md](spec/spec.md) | Yes | Yes | Hub: one-line role per sub-doc plus a link to the phase-1 decisions. |
| [spec/writing-style.md](spec/writing-style.md) | Yes | Yes | Style guide that governs every doc under `spec/`. |
| [test-cases/aggregate.feature](test-cases/aggregate.feature) | Yes | Yes | V2 stub: 1-line TODO for group + aggregate. |
| [test-cases/cancelation.feature](test-cases/cancelation.feature) | Yes | Yes | V1 cross-cutting scenarios: AbortSignal + revert semantics. |
| [test-cases/cli-flags.feature](test-cases/cli-flags.feature) | Yes | Yes | V1 `@offline` scenarios: `--help`, `-h`, bare `help`, no-args, unknown-flag. |
| [test-cases/colsplit.feature](test-cases/colsplit.feature) | Yes | Yes | V2 stub: 1-line TODO for column split / merge. |
| [test-cases/convert.feature](test-cases/convert.feature) | Yes | Yes | V2 stub: 1-line TODO for format conversion. |
| [test-cases/datanorm-expected.jsonl](test-cases/datanorm-expected.jsonl) | Yes | Yes | Golden output for datanorm.feature. |
| [test-cases/datanorm-input.csv](test-cases/datanorm-input.csv) | Yes | Yes | Source fixture for datanorm.feature. |
| [test-cases/datanorm.feature](test-cases/datanorm.feature) | Yes | Yes | V1: field normalization (phone, country, DOB). |
| [test-cases/datanorm.flow](test-cases/datanorm.flow) | Yes | Yes | Replayable spec for the "Execute saved flow" CLI scenario. |
| [test-cases/dedupe-expected.jsonl](test-cases/dedupe-expected.jsonl) | Yes | Yes | Golden output for dedupe.feature. |
| [test-cases/dedupe-input.csv](test-cases/dedupe-input.csv) | Yes | Yes | Source fixture for dedupe.feature. |
| [test-cases/dedupe.feature](test-cases/dedupe.feature) | Yes | Yes | V1: deduplication by Email. |
| [test-cases/dedupe.flow](test-cases/dedupe.flow) | Yes | Yes | Replayable spec for the dedupe saved-flow scenario. |
| [test-cases/filter-expected.jsonl](test-cases/filter-expected.jsonl) | Yes | Yes | Golden output for filter.feature. |
| [test-cases/filter-input.csv](test-cases/filter-input.csv) | Yes | Yes | Source fixture for filter.feature. |
| [test-cases/filter.feature](test-cases/filter.feature) | Yes | Yes | V1: filter by Country. |
| [test-cases/filter.flow](test-cases/filter.flow) | Yes | Yes | Replayable spec for the filter saved-flow scenario. |
| [test-cases/join.feature](test-cases/join.feature) | Yes | Yes | V2 stub: 1-line TODO for lookup join. |
| [test-cases/pivot.feature](test-cases/pivot.feature) | Yes | Yes | V2 stub: 1-line TODO for pivot/unpivot. |
| [test-cases/repl-commands.feature](test-cases/repl-commands.feature) | Yes | Yes | V1 `@offline` scenarios for the three REPL paths that don't call the LLM (`/help`, `/undo`, `/save`, `/save-flow`, `exit`). |
| [test-cases/sort.feature](test-cases/sort.feature) | Yes | Yes | V2 stub: 1-line TODO for sort + top-N. |
| [test-cases/step-defs/cancelation.steps.ts](test-cases/step-defs/cancelation.steps.ts) | Yes | Yes | Step defs for cancelation.feature: AbortSignal plumbing, chunk-completion polling, cancel-latency assertion. |
| [test-cases/step-defs/cli-invocation.steps.ts](test-cases/step-defs/cli-invocation.steps.ts) | Yes | Yes | Step defs for cli-flags.feature and repl-commands.feature: stdout/stderr capture + exit-code assertions. |
| [test-cases/step-defs/cli.hooks.ts](test-cases/step-defs/cli.hooks.ts) | Yes | Yes | Per-tag `Before` hook binding `createCliRunner` to `@cli` scenarios. |
| [test-cases/step-defs/common.steps.ts](test-cases/step-defs/common.steps.ts) | Yes | Yes | Shared Given/When/Then steps used across V1 features. |
| [test-cases/step-defs/env.hooks.ts](test-cases/step-defs/env.hooks.ts) | Yes | Yes | `BeforeAll` hook that calls `loadEnv()` so `ANTHROPIC_API_KEY` is in `process.env` before any scenario runs. |
| [test-cases/step-defs/headless.hooks.ts](test-cases/step-defs/headless.hooks.ts) | Yes | Yes | Per-tag `Before` hook binding `createHeadlessRunner` to `@headless` scenarios. |
| [test-cases/step-defs/world.ts](test-cases/step-defs/world.ts) | Yes | Yes | `TableTamerWorld` + the `Runner` interface step defs program against. |
| [test-cases/validate.feature](test-cases/validate.feature) | Yes | Yes | V2 stub: 1-line TODO for validation/audit. |
| [tsconfig.json](tsconfig.json) | Yes | Yes | Strict TS, ES2022, bundler resolution, no emit. |
| [status-report-2026-05-12.md](status-report-2026-05-12.md) | **No — file was named `status-report-2025-5-12.md` (year typo, single-digit month). Renamed in this audit; the report body always said 2026.** | Yes | Phase-4 completion report from the prior session. |
| [status-report-2026-05-13.md](status-report-2026-05-13.md) | Yes | Yes | This document. |

## Removed in this audit

- `final-review.md` — pre-phase-4 audit using "red-phase any stub" language that no longer applies; structure and intent are fully superseded by the status-report-* files.
- `datanorm-saved.flow` and `datanorm-saved.jsonl` at the repo root — manual `/save` / `/save-flow` test artifacts not referenced anywhere, cluttering the root. The `*-saved.*` entry now in [.gitignore](.gitignore) keeps future ones out.

## Intentional duplications kept

- Q1–Q15 decisions in [phase-1-pre-spec.md](phases/phase-1-pre-spec.md) are restated as contracts in [spec/](spec/) (e.g. the system-prompt token table appears in both Q14 and [headless.md](spec/headless.md)). Discussion in phases, contract in spec.
- The wire model in [data-model.md](spec/data-model.md) is restated narrowly for V1 in [core.md](spec/core.md). The wire doc is forward-looking; core narrows to V1.
- The 2-second cancellation deadline appears in [cancelation.feature](test-cases/cancelation.feature), [runner.md](spec/runner.md), [headless.md](spec/headless.md), and [cli.md](spec/cli.md) — same constraint stated at every level it applies.
- The env-var table is in [README.md](README.md) (full) and the CLI `HELP_TEXT` (abbreviated, with a "full table in README.md" pointer). Two surfaces, deliberate.
