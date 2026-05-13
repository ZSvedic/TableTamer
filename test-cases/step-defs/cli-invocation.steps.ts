import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { Readable, Writable } from 'node:stream';
import { runCli } from '@tabletamer/cli';
import { TableTamerWorld } from './world.ts';

interface InvocationCapture {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const capture = new WeakMap<TableTamerWorld, InvocationCapture>();

function captureStdout(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { stream, text: () => chunks.join('') };
}

function getCapture(world: TableTamerWorld): InvocationCapture {
  const c = capture.get(world);
  if (!c) throw new Error('no prior invocation captured');
  return c;
}

When('user invokes {string}', async function (this: TableTamerWorld, command: string) {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== 'tabletamer') {
    throw new Error(`expected command to start with 'tabletamer', got: ${command}`);
  }
  const stdoutCap = captureStdout();
  const result = await runCli(tokens.slice(1), { stdout: stdoutCap.stream });
  capture.set(this, {
    exitCode: result.exitCode,
    stdout: stdoutCap.text(),
    stderr: result.stderr,
  });
});

When(
  'user enters the REPL with {string} and types:',
  async function (this: TableTamerWorld, csv: string, lines: string) {
    const fixture = `test-cases/${csv}`;
    const stdin = Readable.from([lines.endsWith('\n') ? lines : lines + '\n']);
    const stdoutCap = captureStdout();
    const result = await runCli([fixture], { stdin, stdout: stdoutCap.stream });
    capture.set(this, {
      exitCode: result.exitCode,
      stdout: stdoutCap.text(),
      stderr: result.stderr,
    });
  }
);

Then('exit code is {int}', function (this: TableTamerWorld, code: number) {
  const inv = getCapture(this);
  assert.equal(inv.exitCode, code, `expected exit code ${code}, got ${inv.exitCode}. stderr: ${inv.stderr}`);
});

Then('stdout contains {string}', function (this: TableTamerWorld, text: string) {
  const inv = getCapture(this);
  assert.ok(
    inv.stdout.includes(text),
    `stdout missing substring ${JSON.stringify(text)}. stdout was:\n${inv.stdout}`
  );
});

Then('stderr contains {string}', function (this: TableTamerWorld, text: string) {
  const inv = getCapture(this);
  assert.ok(
    inv.stderr.includes(text),
    `stderr missing substring ${JSON.stringify(text)}. stderr was:\n${inv.stderr}`
  );
});

Then('REPL exit code is {int}', function (this: TableTamerWorld, code: number) {
  const inv = getCapture(this);
  assert.equal(inv.exitCode, code, `expected REPL exit code ${code}, got ${inv.exitCode}. stderr: ${inv.stderr}`);
});

Then('REPL stdout contains {string}', function (this: TableTamerWorld, text: string) {
  const inv = getCapture(this);
  assert.ok(
    inv.stdout.includes(text),
    `REPL stdout missing substring ${JSON.stringify(text)}. stdout was:\n${inv.stdout}`
  );
});
