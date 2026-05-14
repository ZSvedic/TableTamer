import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { readJsonl, type Row } from '@tabletamer/core';
import { runCli } from '@tabletamer/cli';
import { TableTamerWorld, SRC_DIR, SPEC_TC_DIR, TEMP_DIR } from './world.ts';

// A bare name resolves to a committed fixture under spec/test-cases/.
// A name containing a slash is treated as src/-relative (= cwd when cucumber
// runs), so feature files can point generated outputs at ../temp/.
const fixture = (name: string) => (name.includes('/') ? join(SRC_DIR, name) : join(SPEC_TC_DIR, name));

// Generated test outputs (export-as, execute --output) go to temp/, never into
// the committed spec/test-cases/ dir. Golden -expected.jsonl files stay fixtures.
const output = (name: string) => join(TEMP_DIR, basename(name));

Given('{string} is loaded', async function (this: TableTamerWorld, filename: string) {
  this.inputPath = fixture(filename);
  await this.ensureRunner().loadInput(this.inputPath);
});

Given('the golden output is {string}', function (this: TableTamerWorld, filename: string) {
  this.goldenPath = fixture(filename);
});

Given('{string} exists', async function (this: TableTamerWorld, filename: string) {
  await access(fixture(filename));
});

When('user requests {string}', async function (this: TableTamerWorld, text: string) {
  await this.ensureRunner().request(text);
});

When('user requests to export as {string}', async function (this: TableTamerWorld, filename: string) {
  await this.ensureRunner().exportAs(output(filename));
});

When('user runs {string}', async function (this: TableTamerWorld, command: string) {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== 'tabletamer') throw new Error(`expected command to start with 'tabletamer', got: ${command}`);
  // Redirect a generated --output into temp/ so it never lands in spec/test-cases/.
  const args = tokens.slice(1).map((tok, i, arr) =>
    i > 0 && arr[i - 1] === '--output' ? output(tok) : tok
  );
  const result = await runCli(args);
  if (result.exitCode !== 0) {
    throw new Error(`tabletamer exited ${result.exitCode}: ${result.stderr}`);
  }
});

Then('column {string} matches the golden output', async function (this: TableTamerWorld, column: string) {
  const golden = await readJsonl(this.goldenPath!);
  const actual = this.ensureRunner().currentRows();
  assert.equal(actual.length, golden.length, `row count: actual ${actual.length} vs golden ${golden.length}`);
  for (let i = 0; i < golden.length; i++) {
    assert.deepEqual(actual[i]?.[column], golden[i]?.[column], `row ${i} column "${column}"`);
  }
});

Then('the table matches the golden output', async function (this: TableTamerWorld) {
  const golden = await readJsonl(this.goldenPath!);
  const actual = this.ensureRunner().currentRows();
  assert.deepEqual(actual, golden);
});

Then('{string} matches the golden output', async function (this: TableTamerWorld, filename: string) {
  const golden = await readJsonl(this.goldenPath!);
  const actual = await readJsonl(output(filename));
  assert.deepEqual(actual, golden);
});

Then('{string} matches the golden output ignoring {string}', async function (this: TableTamerWorld, filename: string, ignoreColumn: string) {
  const golden = await readJsonl(this.goldenPath!);
  const actual = await readJsonl(output(filename));
  const strip = (rows: Row[]) =>
    rows.map((r) => {
      const copy = { ...r };
      delete copy[ignoreColumn];
      return copy;
    });
  assert.deepEqual(strip(actual), strip(golden));
});

Given('Phone, Country, and DOB are normalized', async function (this: TableTamerWorld) {
  const runner = this.ensureRunner();
  await runner.request('Normalize phone numbers');
  await runner.request('Normalize country names');
  await runner.request('Normalize DOB formats');
});

Given('duplicates are removed by Email', async function (this: TableTamerWorld) {
  await this.ensureRunner().request('Remove duplicate rows by Email');
});

Given('the table is filtered to USA customers', async function (this: TableTamerWorld) {
  await this.ensureRunner().request('Show only customers in the USA');
});
