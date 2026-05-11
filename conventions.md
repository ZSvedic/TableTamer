## Stack & Tooling
- **TypeScript everywhere** (CLI, core, future web). 
- **Runtime + package manager: bun** — always. Use for install (`bun install`), test (`bun x cucumber-js`), run (`bun run`). 
  Bun executes TypeScript natively (no separate compile step).
- **Project layout: monorepo** via bun workspaces. 
  Packages live under `packages/`.
- **Dependency stability**: `minimumReleaseAge = 604800` (7 days) in `bunfig.toml`. 

## Phases
- [phases/phase-1-pre-spec.md](phases/phase-1-pre-spec.md) — Q1–Q15 architecture decisions (CLI surface, LLM stack, data model, harness, test strategy)
- [phases/phase-2-tests.md](phases/phase-2-tests.md) — step-definition backlog (TDD red phase)
- [phases/phase-3-spec.md](phases/phase-3-spec.md) — API spec (derived from phase-2)
- [phases/phase-4-imp-cli.md](phases/phase-4-imp-cli.md) — CLI implementation plan

## Test fixtures
Under `test-cases/`. Naming:
- `<usecase>-input.<ext>` — source fixture (committed)
- `<usecase>-expected.<ext>` — golden output (committed)
- `<usecase>-output.<ext>` — runtime-generated (gitignored)
- `<usecase>.flow` — saved flow (per Q15)
- `<usecase>.feature` — Gherkin scenarios

## Specs
Under `specs/`.

## Process
- Outside-in TDD: 
  Gherkin → step definitions → API spec → implementation → unit tests as edges surface.
- Don't pre-write tests for hypothetical edges.
