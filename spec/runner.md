# Runner

Runner is the object step definitions drive. The CLI package and the headless package both make Runners; the methods are identical, only what each one does under the hood differs.

Step definitions in [common.steps.ts](../test-cases/step-defs/common.steps.ts) get a Runner from `world.ensureRunner()`, then call six methods on it: `loadInput`, `request`, `setSpec`, `currentRows`, `currentSpec`, `exportAs`. The Runner holds the spec, runs the transformations against the source rows, and only commits new state when a request finishes cleanly.

## Example

```ts
await runner.loadInput('test-cases/datanorm-input.csv')
await runner.request('Normalize phone numbers')          // adds a mutate transformation
await runner.request('Remove duplicate rows by Email')   // adds a filter transformation
await runner.exportAs('test-cases/datanorm-output.jsonl')
```

Each `request` sends the user's text to the LLM, applies the patch the LLM sends back, and updates the committed spec. `currentRows` returns the rows that come out of running the current spec; `exportAs` writes those rows to disk.

## Lifecycle

```
fresh ── loadInput ─▶ loaded ─┬─ request ───▶ loaded (committed)
                              ├─ exportAs ──▶ loaded (unchanged)
                              └─ cancel ────▶ loaded (changes undone)
```

A fresh Runner has nothing loaded; `currentRows` and `currentSpec` throw until `loadInput` succeeds. Once loaded, the Runner handles one request at a time — a second `request` while one is still running throws right away. While a request runs, the only other thing you can do is cancel it: an `AbortSignal` on the headless side, Ctrl+C on the CLI.

## Methods

The six methods split into three groups:

- **load input** — `loadInput`
- **change the spec** — `request`, `setSpec`
- **read or save results** — `currentRows`, `currentSpec`, `exportAs`

`loadInput(path)` reads the CSV with [`loadCsv`](core.md), replaces any prior state, and remembers the path as the spec's source for later `.flow` writers. Calling it twice is fine — it resets the transformations, the filter/sort, and any cached LLM results.

`request(text)` sends `text` to the LLM along with the cached system prompt and the current spec; the LLM replies with a patch via the `apply_spec_patch` tool. The Runner then:

1. Applies the patch.
2. Zod-validates the new spec.
3. Re-runs the transformations against the source.
4. Commits — the new spec and rows become visible via `currentRows` / `currentSpec`.

If any step throws, the patch rolls back and the error goes to the LLM as the next turn's input, up to the recovery budget (3 turns by default). The call either succeeds or throws; the spec is never left halfway between two states.

`setSpec(spec)` replaces the committed spec with one the caller hands in, validates it, then replays its transformations against the source rows. No LLM call happens — the spec already exists and just needs to run. This is the path `runCli execute` takes when it loads a saved `.flow` ([cli.md](cli.md)). If validation or any transformation throws, the prior committed state stays in place, same as a failed `request`.

`currentRows()` returns the committed rows. The Runner gets them by replaying the current spec's transformations on the source, then applying any filter and sort. It's a pure read, safe to call any number of times. V1 returns *all* rows, not paged — `spec.page` exists for future renderers but `currentRows` ignores it, so tests can compare full results without paging through.

`currentSpec()` returns the committed spec. While a request is running, both `currentRows` and `currentSpec` return the snapshot from *before* the request — chunk-by-chunk LLM progress shows up through the `onChunk` callback in [headless.md](headless.md), not by changing what `currentRows` returns.

`exportAs(path)` writes `currentRows()` to `path` with [`writeJsonl`](core.md). V1 only supports `.jsonl`; other extensions throw.

## State

```
       immutable source
              │
   transformations[] (replayed)
              │
              ▼
        derived rows  ← currentRows()
              ▲
      filter, sort
```

The source rows from `loadCsv` never change. What changes is `spec.transformations` — the LLM grows or trims this list, and the Runner replays the whole list from scratch to get the current rows. The Runner caches the result and throws the cache away on any spec change. Filter and sort run on top of that when `currentRows` is called.

## Cancellation

Cancel comes in through the surface — `AbortSignal` on headless, Ctrl+C on CLI. The Runner then:

1. Stops sending out new chunks, within 2 seconds ([cancelation.feature](../test-cases/cancelation.feature)).
2. Waits for chunks already in progress to come back.
3. Removes the half-applied transformation from the spec ([data-model.md](data-model.md#failure-recovery)).
4. Throws `Runner: cancelled`.

Anything committed before the cancel stays put — the third scenario in [cancelation.feature](../test-cases/cancelation.feature) is the contract.
