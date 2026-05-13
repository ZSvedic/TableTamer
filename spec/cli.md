# CLI

The CLI is two things on top of headless: an interactive REPL where the user types natural-language requests, and a `tabletamer execute <flow>` command that re-runs a saved spec against a CSV. Both print ASCII tables to stdout and pass every real decision — what the spec looks like, what a transformation does, what counts as valid — down to the headless runner.

Per [phase-1-pre-spec.md Q1](../phases/phase-1-pre-spec.md), the REPL prints a fresh view each turn and never uses terminal control codes. Think `sqlite3` or `jq`, not vim.

## Interactive example

```console
$ tabletamer datanorm-input.csv
TableTamer — datanorm-input.csv (3 columns, 20 rows)
 Email                | Phone           | Country
 alice@example.com    | 555-123-4567    | usa
 bob@example.com      | +44 20 7946     | United Kingdom
 ...
> Normalize phone numbers
running … row 1: Phone "555-123-4567" → "+15551234567"
running … row 2: Phone "+44 20 7946" → "+442079460958"
 Email                | Phone           | Country
 alice@example.com    | +15551234567    | usa
 bob@example.com      | +442079460958   | United Kingdom
 ...
> Show only customers in the USA
 Email                | Phone           | Country
 alice@example.com    | +15551234567    | usa
 ...
```

Every line the user types is a natural-language request. The REPL hands it to `runner.request` and reprints the table when the request finishes. Long LLM transformations print a few sample row changes as chunks come back.

## Batch example

```console
$ tabletamer execute datanorm.flow \
    --input datanorm-input.csv \
    --output datanorm-output.jsonl
$ echo $?
0
```

No LLM call happens — the saved spec is replayed against the CSV and the result is written out.

## `createCliRunner(options?)`

Returns a `Runner` ([runner.md](runner.md)) that wraps a headless runner and adds the things CLI users expect:

- Reprint the ASCII table after every successful `request`.
- Print a few sample row changes per chunk for long LLM transformations.
- Catch Ctrl+C and pass it to the headless runner's cancel `AbortSignal`, which rolls back the half-applied transformation within 2 seconds.

Options forward to `createHeadlessRunner`. By default the runner writes to `process.stdout` / `process.stderr` and reads from `process.stdin`; tests can pass their own streams.

## `runCli(argv)`

The process-level entry point. It returns `{ exitCode, stderr }` instead of calling `process.exit`, so callers can decide what to do with a failure — the step in [common.steps.ts](../test-cases/step-defs/common.steps.ts) reads the exit code directly. With no subcommand, `runCli` starts the REPL; with `execute <flow>`, it runs the batch path:

```
flow    = readJson(<flow>)        # parse + Zod-validate
csvPath = --input || flow.source  # --input wins
runner.loadInput(csvPath)
runner.setSpec(flow.spec)         # replays transformations against the source
runner.exportAs(--output)
```

No LLM call happens on this path ([phase-1-pre-spec.md Q15](../phases/phase-1-pre-spec.md)).

| Exit | Meaning |
|---|---|
| 0 | success |
| 1 | unrecognized subcommand or missing required flag |
| 2 | `.flow` file unreadable, invalid JSON, or fails Zod validation |
| 3 | a transformation references a column that isn't in the loaded CSV, or a JS expression throws |
| 4 | couldn't write to `--output` |

`stderr` carries one human-readable line per non-zero exit.

## `.flow` format

V1 takes Option A from [phase-1-pre-spec.md Q15](../phases/phase-1-pre-spec.md): a JSON file with the source path and the spec.

```json
{
  "version": 1,
  "source": "datanorm-input.csv",
  "spec": { /* V1 Spec — see core.md */ }
}
```

A relative `source` path is read relative to the `.flow` file's own directory; `--input` overrides it. A `version` mismatch exits 2. If the saved spec mentions a column the current CSV doesn't have, `execute` exits 3 with a "column not found" message — the user then re-edits the spec or re-runs against the original CSV. V2 will record the user's original natural-language commands alongside the spec, so the LLM can rebuild the transformations when the schema drifts.
