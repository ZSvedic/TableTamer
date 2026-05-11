# Running tests

Run from this directory (repo root — where `cucumber.js` and `package.json` live).

## 1. Both profiles — canonical red check

```
bun run test:red
```

Runs `--profile headless` then `--profile cli`. Both should be fully red until phase 4. Final exit code is from the last invocation (the `cli` profile).

## 2. Headless profile only

```
bun x cucumber-js --profile headless
```

8 scenarios — every `@headless`-tagged scenario across [datanorm.feature](test-cases/datanorm.feature), [dedupe.feature](test-cases/dedupe.feature), [filter.feature](test-cases/filter.feature). Binds `createHeadlessRunner` from `@tabletamer/headless`.

## 3. CLI profile only

```
bun x cucumber-js --profile cli
```

11 scenarios — every `@cli`-tagged scenario across the same three features, including the saved-flow `tabletamer execute ...` scenarios. Binds `createCliRunner` / `runCli` from `@tabletamer/cli`.

---

Other useful flags layered on top of any of the above:
- `--name "Drop duplicates by Email"` — run scenarios whose name matches the substring.
- `test-cases/dedupe.feature` — restrict to one feature.
- `bun x tsc --noEmit && echo "passed"` — fast type-only red signal (silent = clean).
