import { When, Then } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import { Readable, Writable } from 'node:stream';
import { join } from 'node:path';
import { runCli } from '@tamedtable/cli';
import { TamedTableWorld, SPEC_TC_DIR } from './world.ts';

interface InvocationCapture {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const capture = new WeakMap<TamedTableWorld, InvocationCapture>();

function captureStdout(): { stream: Writable; text: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); } });
  return { stream, text: () => chunks.join('') };
}

function getCapture(world: TamedTableWorld): InvocationCapture {
  const c = capture.get(world);
  if (!c) throw new Error('no prior invocation captured');
  return c;
}

async function runAndCapture(world: TamedTableWorld, argv: string[], extra?: { stdin?: Readable }): Promise<void> {
  const out = captureStdout();
  const result = await runCli(argv, { stdout: out.stream, ...(extra?.stdin ? { stdin: extra.stdin } : {}) });
  capture.set(world, { exitCode: result.exitCode, stdout: out.text(), stderr: result.stderr });
}

function tokenizeCmd(command: string): string[] {
  const tokens = command.trim().split(/\s+/);
  if (tokens[0] !== 'tamedtable') throw new Error(`expected command to start with 'tamedtable', got: ${command}`);
  return tokens.slice(1);
}

When('user invokes {string}', async function (this: TamedTableWorld, command: string) {
  await runAndCapture(this, tokenizeCmd(command));
});

When('user enters the REPL with {string} and types:',
  async function (this: TamedTableWorld, csv: string, lines: string) {
    const stdin = Readable.from([lines.endsWith('\n') ? lines : lines + '\n']);
    await runAndCapture(this, [join(SPEC_TC_DIR, csv)], { stdin });
  }
);

function assertExitCode(world: TamedTableWorld, code: number, label = ''): void {
  const inv = getCapture(world);
  const prefix = label ? `${label} ` : '';
  assert.equal(inv.exitCode, code, `expected ${prefix}exit code ${code}, got ${inv.exitCode}. stderr: ${inv.stderr}`);
}

function assertStreamContains(world: TamedTableWorld, stream: 'stdout' | 'stderr', text: string, label = ''): void {
  const inv = getCapture(world);
  const haystack = inv[stream];
  assert.ok(haystack.includes(text),
    `${label}${label ? ' ' : ''}${stream} missing substring ${JSON.stringify(text)}. ${stream} was:\n${haystack}`);
}

Then('exit code is {int}',            function (this: TamedTableWorld, c: number) { assertExitCode(this, c); });
Then('REPL exit code is {int}',       function (this: TamedTableWorld, c: number) { assertExitCode(this, c, 'REPL'); });
Then('stdout contains {string}',      function (this: TamedTableWorld, t: string) { assertStreamContains(this, 'stdout', t); });
Then('stderr contains {string}',      function (this: TamedTableWorld, t: string) { assertStreamContains(this, 'stderr', t); });
Then('REPL stdout contains {string}', function (this: TamedTableWorld, t: string) { assertStreamContains(this, 'stdout', t, 'REPL'); });
