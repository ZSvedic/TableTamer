## Project layout

The repo is organized by **lifecycle**, not by file type. Four top-level dirs plus a minimal root:

- **`ops/`** — how the project is built, never deployed: `prompts/` (reusable phase-runner templates), `phases/` (per-phase backlogs + the Q1–Q15 decision record), `status-reports/`, `repo-tracking/`, this file, `research-links.md`.
- **`spec/`** — the contract, human-authored / human-blessed: `*.md` specs + `test-cases/` (Gherkin `.feature` files and their `-input.csv` / `-expected.jsonl` / `.flow` fixtures).
- **`src/`** — the implementation. A self-contained, deployable unit: it carries its own `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `cucumber.js`, `node_modules/`. Subdirs are regenerable from `spec/`: `packages/` (core / headless / cli) and `tests/` (cucumber step definitions). The `src/` root files are permanent — not regenerable, not deletable.
- **`temp/`** — scratch: generated outputs, charts, logs. Gitignored, deletable any time.
- **Root** — only `README.md`, `LICENSE`, `.gitignore`.

Rationale for the boundaries:
- **`src/` holds the JS config** because `package.json` is coupled to the code it builds, and Node module resolution walks *up* — so anything importing dependencies (app code *and* step defs) must live under the dir that holds `node_modules/`. That makes `src/` a single deployable unit you can copy and run.
- **`.feature` files live in `spec/`, step defs in `src/tests/`** — the same spec/implementation split as `spec/core.md` ↔ `src/packages/core/`. Step defs read fixtures from `spec/test-cases/` by plain file path (data reads, unlike imports, cross directories freely).
- **Edits by the AI to `spec/test-cases/*-expected.jsonl`** (golden files) are spec changes — review them, don't treat them as routine fixture churn.

## Stack & Tooling
- **TypeScript everywhere** (CLI, core, future web).
- **Runtime + package manager: bun** — always. All `bun` commands run from `src/` (that's where `package.json` lives). Bun executes TypeScript natively (no separate compile step).
- **Project layout: monorepo** via bun workspaces. Packages live under `src/packages/`.
- **Dependency stability**: `minimumReleaseAge = 604800` (7 days) in `src/bunfig.toml`.

## Phases
- [phases/phase-1-pre-spec.md](phases/phase-1-pre-spec.md) — Q1–Q15 architecture decisions (CLI surface, LLM stack, data model, harness, test strategy)
- [phases/phase-2-tests.md](phases/phase-2-tests.md) — step-definition backlog (TDD red phase)
- [phases/phase-3-spec.md](phases/phase-3-spec.md) — API spec (derived from phase-2)
- [phases/phase-4-imp-cli.md](phases/phase-4-imp-cli.md) — CLI implementation plan

## Test fixtures
Under `spec/test-cases/`. Naming:
- `<usecase>-input.<ext>` — source fixture (committed)
- `<usecase>-expected.<ext>` — golden output (committed)
- `<usecase>-output.<ext>` — runtime-generated (gitignored)
- `<usecase>.flow` — saved flow (per Q15)
- `<usecase>.feature` — Gherkin scenarios

## Specs
Under `spec/` — hub at [../spec/spec.md](../spec/spec.md), style rules in [../spec/writing-style.md](../spec/writing-style.md).

## Process
- Outside-in TDD:
  Gherkin → step definitions → API spec → implementation → unit tests as edges surface.
- Don't pre-write tests for hypothetical edges.
