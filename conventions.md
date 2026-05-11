# TableTamer — Project Conventions

## Stack

- **TypeScript everywhere** (CLI, core, future web). Per [phase-1-pre-spec.md](phases/phase-1-pre-spec.md) Q2 and Q11.

## Tooling

- **Runtime + package manager: bun** — always. Use for install (`bun install`), test (`bun x cucumber-js`), run (`bun run`). Bun executes TypeScript natively (no separate compile step).
- **Project layout: monorepo** via bun workspaces. Packages live under `packages/`.
- **Dependency stability**: `minimumReleaseAge = 604800` (7 days) in `bunfig.toml`. Refuses packages newer than 7 days — mitigates supply-chain attacks.

## Where decisions live

- [phases/phase-1-pre-spec.md](phases/phase-1-pre-spec.md) — Q1–Q15 architecture decisions (CLI surface, LLM stack, data model, harness, test strategy)
- [spec/data-model.md](spec/data-model.md) — Spec + Transformations + Patches wire format
- [phases/phase-2-tests.md](phases/phase-2-tests.md) — step-definition backlog (TDD red phase)
- [phases/phase-3-spec.md](phases/phase-3-spec.md) — API spec (derived from phase-2)
- [phases/phase-4-imp-cli.md](phases/phase-4-imp-cli.md) — CLI implementation plan
- [spec/rationale.md](spec/rationale.md) — project purpose
- [spec/research-links.md](spec/research-links.md) — name + library research

## Test fixtures

Under `test-cases/`. Naming:
- `<usecase>-input.<ext>` — source fixture (committed)
- `<usecase>-expected.<ext>` — golden output (committed)
- `<usecase>-output.<ext>` — runtime-generated (gitignored)
- `<usecase>.flow` — saved flow (per Q15)
- `<usecase>.feature` — Gherkin scenarios

## Process

- Outside-in TDD per Q4: Gherkin → step definitions → API spec → implementation → unit tests as edges surface.
- Don't pre-write tests for hypothetical edges (Q5).
- Compact decision records: ≤5 sentences in `A:` line; longer rationale in `## Answer details`.
