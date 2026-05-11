import { Given, When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { access } from 'node:fs/promises';
import { readJsonl, type Row } from '@tabletamer/core';
import { runCli } from '@tabletamer/cli';
import { TableTamerWorld } from './world.ts';

const FIXTURE_DIR = 'test-cases';
const fixture = (name: string) => `${FIXTURE_DIR}/${name}`;

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
  await this.ensureRunner().exportAs(fixture(filename));
});

When('user runs {string}', async function (this: TableTamerWorld, command: string) {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== 'tabletamer') throw new Error(`expected command to start with 'tabletamer', got: ${command}`);
  const result = await runCli(tokens.slice(1));
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
  const actual = await readJsonl(fixture(filename));
  assert.deepEqual(actual, golden);
});

Then('{string} matches the golden output ignoring {string}', async function (this: TableTamerWorld, filename: string, ignoreColumn: string) {
  const golden = await readJsonl(this.goldenPath!);
  const actual = await readJsonl(fixture(filename));
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
