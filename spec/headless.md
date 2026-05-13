# Headless

Headless owns the LLM harness: it turns natural-language requests into spec patches, runs the transformations against the source rows, and lets the user watch progress chunk by chunk and cancel a slow operation. It doesn't print to a terminal, manage processes, or read and write files (beyond calling core's I/O); `createHeadlessRunner()` returns a Runner that step definitions drive directly and that the CLI wraps for its REPL.

The harness is built from scratch on top of the Vercel AI SDK ([phase-1-pre-spec.md Q11](../phases/phase-1-pre-spec.md)). There's no rolling chat history: each request is a fresh turn whose only context is the cached system prompt and the current spec — about 1 KB per turn, no matter how big the table is or how many requests have come before ([data-model.md](data-model.md#per-turn-token-budget)).

## Example turn

```
spec before:  { columns: [...], transformations: [] }
user says:    "Normalize phone numbers"
LLM replies:  apply_spec_patch([
                { op: "add", path: "/transformations/-",
                  value: { kind: "mutate", columns: "Phone",
                           value: { llm: "Format '{Phone}' as E.164." } } }
              ])
runner:       validate → apply → run chunks → commit
spec after:   { columns: [...], transformations: [<the mutate>] }
```

The user's request goes in; a patch comes back; the patch adds one transformation that calls the LLM for each row's `Phone` value. Once every chunk returns, the new spec is committed and the new rows show up in `currentRows`.

## Components

The harness has five parts:

- **conversation driver** — talks to the LLM
- **`apply_spec_patch` tool** — the only way the LLM can change the spec
- **transformation evaluator** — runs the spec's transformations against the source rows
- **chunk dispatcher** — parallelizes long LLM transformations and reports progress back
- **error feedback loop** — catches failures and asks the LLM to try again

The conversation driver wraps `generateText` / `streamText` from the `ai` package. It sends each request as a single turn (no rolling history) and routes any tool call the LLM makes back to the harness.

The `apply_spec_patch` tool takes a list of JSON Patch operations (RFC 6902). The LLM can only change the spec through this tool; the harness applies the operations with `fast-json-patch`, plus a small hand-rolled RFC 7396 merge for shallow edits.

The transformation evaluator runs `spec.transformations` against the immutable source. A JS expression compiles with `new Function` using the `(row, index, allRows)` signature. An LLM expression hands off to the chunk dispatcher.

The chunk dispatcher splits rows into batches, calls the model in parallel, and gathers the answers back in source order. It yields an `AsyncIterable<Update>` so progress and the cancel `AbortSignal` flow through cleanly ([phase-1-pre-spec.md Q10](../phases/phase-1-pre-spec.md)).

The error feedback loop catches Zod validation failures, query failures (a JS expression that throws, an `{Column}` placeholder that doesn't match any column, a V2 feature in a V1 spec), and one shape of LLM mistake: calling `apply_spec_patch` with an empty operations array or with a patch that applies cleanly but leaves `transformations` unchanged. In every case the loop rolls back the patch and feeds the error back to the LLM as the next turn's input. The budget is 3 recovery turns; running out throws.

## System prompt

The cacheable prefix is about 600 tokens, marked with `cache_control: { type: 'ephemeral' }` on the Anthropic provider ([phase-1-pre-spec.md Q14](../phases/phase-1-pre-spec.md)):

| Section | Tokens | Source |
|---|---|---|
| Role + goal | ~30 | static |
| `apply_spec_patch` description | ~150 | generated from the Zod schema |
| Spec-format prose | ~100 | refers back to the Zod schema for the full shape |
| Transformation grammar + V1 Expr | ~150 | four V1 verbs, `{js}` / `{llm}` shapes |
| Three few-shot examples | ~150 | JS filter, LLM mutate, JS dedupe with `(row, i, rows)` |
| Error-recovery rule | ~20 | "on rejection, read the error and send a corrected patch" |

Per-turn slots that aren't cached: the current spec (~300 tokens), the user's request (~30), and the last error if we're recovering (~50). The first turn pays the full ingest cost; every later turn hits the cache.

## Chunk and cancel

While an LLM transformation runs, each completed chunk fires the `onChunk` callback with the rows it just produced. The committed spec and rows don't change until the whole transformation finishes; the callback is how the CLI prints progress lines and how the future web shell will paint skeleton rows.

A cancel triggers the four-step sequence in [runner.md](runner.md#cancellation). What's specific to headless: the `AbortSignal` is what stops the chunk dispatcher from scheduling new model calls; model calls that are already running finish before step 3 reverts the half-applied transformation.

## Determinism

The runtime pins `temperature: 0` on every model call, but that doesn't make outputs byte-identical across model versions or providers. Sonnet and Haiku both produce plausible E.164 phone numbers for an ambiguous input like `"020 555 8765"`, but the exact normalization differs — and the LLM's own minor revisions can change the answer for the same prompt over time. Tests that compare LLM-produced cells against a frozen golden JSONL file are testing one specific `(model, version, prompt)` triple, not the transformation contract.

V1 ships the golden files anyway because the fixtures are small and the convenience outweighs the fragility. A future revision should either pin each golden to a stamped `(model, version)` pair, or assert the semantic invariant — *"output starts with `+<country code>` and contains every digit from the input"* — instead of string equality. Until then, golden mismatches on LLM-driven cells aren't necessarily regressions.
