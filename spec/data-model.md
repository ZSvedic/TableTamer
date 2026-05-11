# Data model — JSON Spec + Patches

A design pattern for LLM-driven UIs that manipulate **extremely large tables** (millions of rows × hundreds of columns). Built to keep per-turn token cost constant regardless of table size or conversation length.

## Problem

Treating chat history as the state of record breaks at large-table scale:
- Can't send the data to the LLM — token budget.
- Can't re-stream the UI source per turn — compounds across turns.
- Can't replay history — every prior assistant response accumulates forever.

## Approach

Decouple **spec** from **data**:

1. **Spec** — a small JSON document describing the *view* over the table (columns, filter, sort, page, pivot, aggregations). The LLM owns this; the runtime persists it across turns.
2. **Data** — the actual rows, materialized server-side by running the spec as a query. Streamed to the client; **never** to the LLM.x

Each turn, the model emits a **patch** to the spec — [JSON Merge Patch (RFC 7396)](https://datatracker.ietf.org/doc/html/rfc7396) for shallow edits, [JSON Patch (RFC 6902)](https://datatracker.ietf.org/doc/html/rfc6902) for array ops merge-patch can't express.

## Spec example

```json
{
  "table": "orders",
  "columns": [
    { "id": "order_id", "label": "Order #" },
    { "id": "customer", "label": "Customer" },
    { "id": "total",    "label": "Total", "format": "currency" }
  ],
  "filter": { "and": [
    { "col": "status", "op": "eq",  "value": "paid" },
    { "col": "date",   "op": "gte", "value": "2025-01-01" }
  ]},
  "sort":    [{ "col": "date", "dir": "desc" }],
  "page":    { "size": 50, "offset": 0 },
  "summary": { "groupBy": [], "aggregates": [] }
}
```

## Edit example

User: *"sort by total descending, show top 25"*

Model emits (merge patch):
```json
{
  "sort": [{ "col": "total", "dir": "desc" }],
  "page": { "size": 25, "offset": 0 }
}
```

Runtime: deep-merges into the current spec (RFC 7396), validates against JSON Schema, re-runs the query, streams the new rows.

For an operation merge-patch can't express — e.g. *"hide the customer column"*:
```json
[{ "op": "remove", "path": "/columns/1" }]
```

## Transformations

The Spec carries an ordered `transformations: Transformation[]` list that mutates data before view ops (filter/sort/page/summary) run. The runtime replays them on the immutable source; "undo" = pop the last transformation.

```ts
type Expr =
  | { js:  string }                              // JS arrow function (V1)
  | { sql: string }                              // DuckDB SQL expression (V2)
  | { llm: string; model?: string };             // prompt template using {Column} placeholders

type Transformation =
  | { kind: "filter"; pred: Expr }
  | { kind: "mutate"; columns: string | string[]; value: Expr }
  | { kind: "select"; columns: string[] }
  | { kind: "sort";   by: Array<{ key: Expr | string; dir: "asc"|"desc" }> }
  | { kind: "group";  by: Array<Expr | string>; agg: Record<string, Expr> }   // V2
  | { kind: "join";   with: string; on: Expr; how?: "inner" | "left" };       // V2
```

`Expr` lets any verb swap deterministic code for an LLM prompt:
- `{js: "..."}` → `new Function()`-evaluated arrow function; signature `(row, index, allRows) => result`. **V1.**
- `{sql: "..."}` → DuckDB. **V2.**
- `{llm: "..."}` → batch rows, parallel-call the model, gather results; results cached by `(input cells + prompt + model)` (V2).

**V1 subset:** `filter` + `mutate` (both modes) + `select` + `sort` (sql only). `group`/`join` are V2.

**Example — LLM-driven country canonicalization:**
```json
{ "kind": "mutate", "columns": "Country",
  "value": { "llm": "Normalize country name '{Country}' to standard English." } }
```

## Per-turn token budget

| Slot | Tokens |
|------|--------|
| System prompt | ~500 |
| Current spec | ~300 |
| Last user message | ~30 |
| Last error (if any) | ~50 |
| Model output (one patch) | ~30–100 |
| **Total** | **~1 KB per turn, constant** |

Independent of table size *and* of conversation length. No prior assistant responses ever re-sent.

## Telling the model about the data

The model edits the spec; the runtime fills in just-enough data context as prompt slots:

- **Always:** column schema (names + types).
- **On model request:** row count, distinct counts, top-K values, percentiles, one sample row.
- **Never:** the rows themselves.

These are runtime-supplied slots, not state the model maintains.

## Rendering

Client receives `(spec, row_stream)`:
- Spec drives column layout, formatters, header order.
- Rows stream paginated / virtualized for the huge case.
- Renderer (MUI DataGrid, AG Grid, TanStack Table, plain `<table>`) is implementation detail. The spec is the wire protocol.

## Failure recovery

| Failure | Behavior |
|---------|----------|
| Patch fails JSON Schema validation | Reject; send validation error as next-turn input; spec unchanged. |
| Patch applies but query fails (bad column, type mismatch) | Rollback; send query error as next-turn input. |
| Catastrophic spec drift | Ask the model to emit a **fresh full spec** instead of a patch — recovery is bounded because the spec stays small. |

## Why this scales where chat-as-state doesn't

| | Chat-as-state | Spec + patches |
|---|---|---|
| Data sent to LLM | grows with table | never |
| Per-turn input | grows with conversation | constant |
| Per-turn output | full UI source each turn | one patch |
| State of record | the chat log | the spec document |
| Renderer change | new prompt + retraining | swap one client module |
