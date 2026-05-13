# Running tests

Run from this directory (repo root — where `cucumber.js` and `package.json` live).

## 1. Both profiles

```
bun run test
```

Runs `--profile headless` then `--profile cli`. Final exit code is from the last invocation (the `cli` profile).

The `@offline` subset (CLI flags + REPL slash commands) skips the LLM. Run it alongside bun's unit tests with:

```
bun run test:offline
```

## 2. Headless profile only

```
bun x cucumber-js --profile headless
```

Every `@headless`-tagged scenario across [datanorm.feature](test-cases/datanorm.feature), [dedupe.feature](test-cases/dedupe.feature), [filter.feature](test-cases/filter.feature), and [cancelation.feature](test-cases/cancelation.feature). Binds `createHeadlessRunner` from `@tabletamer/headless`.

## 3. CLI profile only

```
bun x cucumber-js --profile cli
```

Every `@cli`-tagged scenario across the same four features, plus [cli-flags.feature](test-cases/cli-flags.feature) and [repl-commands.feature](test-cases/repl-commands.feature). Binds `createCliRunner` / `runCli` from `@tabletamer/cli`.

---

Other useful flags layered on top of any of the above:
- `--name "Drop duplicates by Email"` — run scenarios whose name matches the substring.
- `test-cases/dedupe.feature` — restrict to one feature.
- `bun x tsc --noEmit && echo "passed"` — fast type-only check (silent = clean).
