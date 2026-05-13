# TableTamer

A CLI ETL tool you drive with natural language. Load a CSV, type *"normalize phone numbers"* or *"drop duplicate emails,"* and the LLM rewrites a small JSON spec that the runtime replays against the data. The full motivation is in [spec/rationale.md](spec/rationale.md); the wire-protocol idea — keeping per-turn token cost constant regardless of table size — is in [spec/data-model.md](spec/data-model.md).

V1 ships a terminal CLI and a headless library. A web UI is V2.

## Setup

You need [bun](https://bun.sh) and an Anthropic API key.

1. Install dependencies:
   ```
   bun install
   ```
2. Put your API key in a `.env` file at the repo root:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   That's it — the CLI and the tests both read `.env` automatically through `loadEnv()` in `@tabletamer/core`. No `export` lines, no `unset` workaround, no shell-rc edits. If `ANTHROPIC_API_KEY` is already set non-empty in your shell, the shell value wins; if it's missing or empty, `.env` fills it in.

Optional env vars (sensible defaults if you omit them):

| Var | Default | What it does |
|---|---|---|
| `TABLETAMER_MODEL` | `claude-sonnet-4-5` | Model that writes the spec patch each turn. |
| `TABLETAMER_CELL_MODEL` | `claude-haiku-4-5` | Model that fills in per-row LLM cells (cheaper, faster). |
| `TABLETAMER_RPM` | `40` | Per-process request-per-minute cap. The Anthropic org-wide ceiling is 50; the default leaves headroom for retries. |

## Run the CLI

Interactive REPL — load a CSV, then type requests until you `/quit`:

```
bun packages/cli/src/index.ts test-cases/datanorm-input.csv
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
> /quit
```

Ctrl-C cancels an in-progress request and rolls back the half-applied transformation.

Batch mode — replay a saved `.flow` against a CSV with no LLM call:

```
bun packages/cli/src/index.ts execute test-cases/datanorm.flow \
    --input test-cases/datanorm-input.csv \
    --output /tmp/out.jsonl
```

Exit codes are documented in [spec/cli.md](spec/cli.md).

## Run the tests

```
bun run test
```

That runs both cucumber profiles (`headless` then `cli`) over the four V1 features. For per-profile commands, filtering by feature or scenario name, and the type-only fast check, see [TESTING.md](TESTING.md).

## Project layout

```
packages/
  core/         # types, validation, .env loader, CSV/JSONL I/O
  headless/     # LLM harness — turns requests into spec patches
  cli/          # REPL + `execute` subcommand on top of headless
spec/           # API spec (hub at spec/spec.md)
phases/         # phase-1..4 audit trail
test-cases/     # .feature files, fixtures, step definitions
```

Conventions for the stack and the dev process are in [conventions.md](conventions.md).

## Known limitations

- **Per-org rate limit dominates wall-clock.** A full test run is 7–9 minutes; most of that is the 40 RPM throttle waiting out the 50 RPM org ceiling, not LLM latency. Two back-to-back runs risk hitting the cap on retries.
- **Golden-file fragility on LLM cells.** Some `datanorm` scenarios assert byte equality against a frozen JSONL golden. Sonnet and Haiku produce semantically-equivalent but not byte-identical outputs for ambiguous inputs (e.g. phone numbers without a country code), and the model's own minor revisions can shift the answer over time. Mismatches on LLM-driven cells aren't necessarily regressions — see the *Determinism* section in [spec/headless.md](spec/headless.md).
- **CSV in, JSONL out.** Other formats are V2.
