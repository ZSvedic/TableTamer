# TableTamer

A CLI ETL tool you drive with natural language. Load a CSV, type *"normalize phone numbers"* or *"drop duplicate emails,"* and the LLM rewrites a small JSON spec that the runtime replays against the data. The full motivation is in [spec/rationale.md](spec/rationale.md); the wire-protocol idea — keeping per-turn token cost constant regardless of table size — is in [spec/data-model.md](spec/data-model.md).

V1 ships a terminal CLI and a headless library. A web UI is V2.

## Project layout

The repo is organized by **lifecycle**, not by file type:

```
ops/      How the project is built: prompts, phase backlogs, status reports,
          repo-tracking scripts, conventions, research notes. Never deployed.
spec/     The contract: *.md specs + test-cases/ (Gherkin features + fixtures).
          Human-authored / human-blessed.
src/      The implementation. Self-contained, deployable unit — it carries its
          own package.json, bun.lock, node_modules/. Run bun from here.
          src/packages/  — core / headless / cli (regenerable from spec/*.md)
          src/tests/     — cucumber step definitions (regenerable from Gherkin)
temp/     Scratch: generated outputs, charts, logs. Gitignored, deletable.
```

Root holds only `README.md`, `LICENSE`, `.gitignore`. Everything build-related lives in `src/`, so **all `bun` commands run from `src/`**. Conventions for the stack and the dev process are in [ops/conventions.md](ops/conventions.md).

## Setup

You need [bun](https://bun.sh) and an Anthropic API key.

1. Install dependencies (from `src/`, where `package.json` lives):
   ```
   cd src && bun install
   ```
2. Put your API key in a `.env` file at the repo root (the loader walks up from `src/` to find it):
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

Optional env vars and defaults if you omit them:

| Var | Default | What it does |
|---|---|---|
| `TABLETAMER_MODEL` | `claude-sonnet-4-5` | Model that writes the spec patch each turn. |
| `TABLETAMER_CELL_MODEL` | `claude-sonnet-4-5` | Model that fills in per-row LLM cells. Default matches the patch model for accuracy on multi-row batches; override with `claude-haiku-4-5` for cheaper/faster runs at some cost in per-cell fidelity. |
| `TABLETAMER_RPM` | `40` | Per-process request-per-minute cap. The Anthropic org-wide ceiling is 50. |
| `TABLETAMER_BATCH_SIZE` | `20` | Rows packed into a single LLM request. The model replies with a JSON array; on a parse failure the runner falls back to per-row calls for that batch. Set to `1` to disable batching. |
| `TABLETAMER_CHUNK_SIZE` | `5` | LLM requests that fire concurrently. Orthogonal to batch size — total parallel rows = batch × chunk. |
| `TABLETAMER_DEBUG` | unset | When set, the REPL prints a per-turn debug block after a failed request (indented, dimmed, capped at 20 lines). |

## Run the CLI

Interactive REPL — load a CSV, then type natural-language requests. Inside the session: `/help` lists commands, `/undo` reverts the last transformation, `/save <out.jsonl>` writes current rows to disk, `/save-flow <out.flow>` saves the current spec for later replay, `exit` leaves.

```
bun src/packages/cli/index.ts spec/test-cases/datanorm-input.csv
```

```
 Email                | Phone           | Country
 alice@example.com    | 555-123-4567    | usa
 ...
> normalize phone numbers
running … row 1: Phone "555-123-4567" → "+15551234567"
 Email                | Phone           | Country
 alice@example.com    | +15551234567    | usa
 ...
> exit
```

Ctrl-C cancels an in-progress request and rolls back the half-applied transformation.

Batch mode — replay a saved `.flow` against a CSV with no LLM call:

```
bun src/packages/cli/index.ts execute spec/test-cases/datanorm.flow \
    --input spec/test-cases/datanorm-input.csv \
    --output temp/out.jsonl
```

Exit codes are documented in [spec/cli.md](spec/cli.md).

## Run the tests

All test commands run from `src/`.

```
cd src
bun run test          # both cucumber profiles (headless then cli) over the V1 features
bun run test:offline  # bun unit tests + the @offline cucumber subset (no LLM, no API key)
```

`bun run test` runs `--profile headless` then `--profile cli`; the final exit code is from the `cli` profile. The `@offline` subset (CLI flags + REPL slash commands) and the bun unit tests need no API key.

Narrower runs, layered on top of any of the above:

```
bun x cucumber-js --profile headless                          # @headless scenarios only
bun x cucumber-js --profile cli                               # @cli scenarios only
bun x cucumber-js --profile cli --name "Drop duplicates"      # match scenario name substring
bun x cucumber-js ../spec/test-cases/dedupe.feature           # one feature file
bun x tsc --noEmit && echo "passed"                           # fast type-only check
bun test                                                      # bun unit tests only
```

The `headless` profile binds `createHeadlessRunner` from `@tabletamer/headless`; the `cli` profile binds `createCliRunner` / `runCli` from `@tabletamer/cli`. Both cover [datanorm](spec/test-cases/datanorm.feature), [dedupe](spec/test-cases/dedupe.feature), [filter](spec/test-cases/filter.feature), and [cancelation](spec/test-cases/cancelation.feature); the `cli` profile also covers [cli-flags](spec/test-cases/cli-flags.feature) and [repl-commands](spec/test-cases/repl-commands.feature).

## Known limitations

- **Per-org rate limit dominates wall-clock.** A full test run is 7–9 minutes; most of that is the 40 RPM throttle waiting out the 50 RPM org ceiling, not LLM latency. Two back-to-back runs risk hitting the cap on retries.
- **Golden-file fragility on LLM cells.** Some `datanorm` scenarios assert byte equality against a frozen JSONL golden. Sonnet and Haiku produce semantically-equivalent but not byte-identical outputs for ambiguous inputs (e.g. phone numbers without a country code), and the model's own minor revisions can shift the answer over time. Mismatches on LLM-driven cells aren't necessarily regressions — see the *Determinism* section in [spec/headless.md](spec/headless.md).
- **CSV in, JSONL out.** Other formats are V2.
