# Core

Core defines the shared types — `Spec`, `Row`, `Transformation`, `Expr` — and the functions that read CSV files in and write JSONL files out. It doesn't call the LLM, doesn't render anything, and doesn't know about the terminal or the user; every other `@tabletamer/*` package imports from it.

The full type model lives in [data-model.md](data-model.md). This doc narrows that model to V1 and describes what the I/O functions actually do.

## Example

After the user asks *"normalize phone numbers, then drop duplicate emails,"* the spec ends up looking like this:

```json
{
  "table": "datanorm-input",
  "columns": [{ "id": "Email" }, { "id": "Phone" }, { "id": "Country" }],
  "transformations": [
    { "kind": "mutate", "columns": "Phone",
      "value": { "llm": "Format '{Phone}' as E.164." } },
    { "kind": "filter",
      "pred": { "js": "(row, i, rows) => rows.findIndex(r => r.Email === row.Email) === i" } }
  ]
}
```

The runtime reads the source CSV with `loadCsv`, runs each transformation in order, and writes the result with `writeJsonl`. Core supplies the types and the file I/O; everything in between lives in [runner.md](runner.md) and [headless.md](headless.md).

## V1 scope

V1 keeps four pure verbs and two expression shapes; everything else is V2.

- `Transformation.kind` is one of `filter`, `mutate`, `select`, `sort`. `group` and `join` are V2.
- `Expr` is either `{ js: string }` or `{ llm: string; model?: string }`. `{ sql }` is V2.
- `Spec.summary.groupBy` and `Spec.summary.aggregates` are accepted only as empty arrays, so V2 specs that fill them can still parse here.

A JS expression is the body of an arrow function with signature `(row, index, allRows) => result` ([phase-1-pre-spec.md Q13](../phases/phase-1-pre-spec.md)). The runtime wraps it as `return (<body>)` and compiles it once.

An LLM expression is a prompt template with `{Column}` placeholders. The runtime renders one prompt per row by substituting `{Column}` for that row's value, then batches multiple rendered prompts into a single LLM call (default 20 rows per call) that replies with a JSON array of results — see [headless.md](headless.md) for the batch protocol. Identical rendered prompts hit a per-session cache, so duplicate inputs cost nothing after the first. A placeholder that doesn't match any column is an error, and the recovery loop in [runner.md](runner.md) feeds the error back to the LLM.

## I/O

`loadCsv(path)` reads a CSV with `csv-parse` and builds the initial spec: `columns[]` taken from the header in order, an empty `transformations`, no filter or sort yet. Every value stays a string — the runtime doesn't try to guess whether a value is a number or a date; that's the LLM's job via a `mutate` transformation. A missing header, a duplicate column id, or an unreadable file throws an error that includes the file path.

`readJsonl(path)` reads one JSON object per line. Blank lines are skipped, a malformed line throws an error that names the line number, and an empty file returns an empty array. Step definitions use this to compare current rows against the golden output ([common.steps.ts](../test-cases/step-defs/common.steps.ts)).

`writeJsonl(path, rows)` writes one object per line with a trailing newline. Key order follows the spec's `columns[]` at the moment of writing; if a row is missing a column it gets `null`. The file is overwritten; the parent directory must already exist.

V1 reads CSV and writes JSONL. CSV-out and other formats are V2.

## Validation

A single Zod schema covers the V1 type set. It runs at three points:

- when `loadCsv` builds the initial spec
- when the LLM's `apply_spec_patch` tool merges a patch
- when `runCli execute` loads a `.flow` file (see [cli.md](cli.md))

It checks four things:

- `kind` is one of the four V1 verbs
- `Expr` is one of the two V1 shapes
- `summary.groupBy` and `summary.aggregates` are empty
- nothing in the spec uses a V2-only feature — a `kind: "group"` or `Expr.sql` gets a clear *"V2 feature in V1 spec"* error rather than being silently ignored

What it does *not* check: whether a JS body compiles, or whether an LLM placeholder matches a real column. Those problems show up when the transformation actually runs, and the recovery loop in [runner.md](runner.md) feeds them back to the LLM.
