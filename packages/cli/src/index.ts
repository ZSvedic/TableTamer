#!/usr/bin/env -S bun run
import * as readline from 'node:readline/promises';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  loadCsv,
  loadEnv,
  readJsonl,
  writeJsonl,
  validateSpec,
  type Row,
  type Spec,
} from '@tabletamer/core';
import {
  createHeadlessRunner,
  type ChunkUpdate,
  type HeadlessRunner,
  type HeadlessRunnerOptions,
  type RequestDebugInfo,
} from '@tabletamer/headless';

export interface CliRunnerOptions extends HeadlessRunnerOptions {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  stdin?: NodeJS.ReadableStream;
  quiet?: boolean;
}

export interface CliRunner {
  loadInput(path: string): Promise<void>;
  request(text: string, opts?: { signal?: AbortSignal; onChunk?: (u: ChunkUpdate) => void }): Promise<void>;
  setSpec(spec: Spec): Promise<void>;
  currentRows(): Row[];
  currentSpec(): Spec;
  exportAs(path: string): Promise<void>;
}

class CliRunnerImpl implements CliRunner {
  private headless: HeadlessRunner;
  private stdout: NodeJS.WritableStream;
  private quiet: boolean;

  constructor(opts: CliRunnerOptions) {
    this.stdout = opts.stdout ?? process.stdout;
    this.quiet = opts.quiet ?? true;
    const onChunk = (u: ChunkUpdate) => {
      if (this.quiet) return;
      const beforeStr = u.before === null || u.before === undefined ? '' : String(u.before);
      const afterStr = u.after === null || u.after === undefined ? 'null' : String(u.after);
      this.stdout.write(`running … row ${u.rowIndex + 1}: ${u.column} "${beforeStr}" → "${afterStr}"\n`);
    };
    this.headless = createHeadlessRunner({ ...opts, onChunk: opts.onChunk ?? onChunk });
  }

  async loadInput(path: string): Promise<void> {
    await this.headless.loadInput(path);
    if (!this.quiet) this.printTable();
  }

  async request(text: string, opts?: { signal?: AbortSignal; onChunk?: (u: ChunkUpdate) => void }): Promise<void> {
    await this.headless.request(text, opts);
    if (!this.quiet) this.printTable();
  }

  async setSpec(spec: Spec): Promise<void> {
    await this.headless.setSpec(spec);
  }

  currentRows(): Row[] {
    return this.headless.currentRows();
  }

  currentSpec(): Spec {
    return this.headless.currentSpec();
  }

  async exportAs(path: string): Promise<void> {
    await this.headless.exportAs(path);
  }

  private printTable(): void {
    const spec = this.headless.currentSpec();
    const rows = this.headless.currentRows();
    this.stdout.write(renderTable(spec, rows) + '\n');
  }
}

export function createCliRunner(opts: CliRunnerOptions = {}): CliRunner {
  return new CliRunnerImpl(opts);
}

export function renderTable(spec: Spec, rows: Row[]): string {
  const cols = spec.columns.map((c) => c.id);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => stringify(r[c]).length))
  );
  const header = ' ' + cols.map((c, i) => c.padEnd(widths[i]!)).join(' | ');
  const body = rows
    .map((r) => ' ' + cols.map((c, i) => stringify(r[c]).padEnd(widths[i]!)).join(' | '))
    .join('\n');
  return body.length ? `${header}\n${body}` : header;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function userFacingMessage(message: string): string {
  if (message.startsWith('Runner: recovery budget exhausted')) {
    return "Couldn't apply that change after 3 attempts. Try rephrasing or breaking it into smaller steps.";
  }
  if (message === 'Runner: cancelled') return 'Cancelled.';
  if (message === 'Runner: a request is already in progress.') return 'A request is already running.';
  return message;
}

function renderError(err: Error, stdout: NodeJS.WritableStream): void {
  stdout.write(`error: ${userFacingMessage(err.message)}\n`);
  if (!process.env.TABLETAMER_DEBUG) return;
  const dbg = (err as Error & { debug?: RequestDebugInfo }).debug;
  if (!dbg) return;
  const useColor = Boolean((stdout as { isTTY?: boolean }).isTTY);
  const MAX_LINES = 20;
  const MAX_OPS_CHARS = 200;
  const MAX_SENT_CHARS = 120;
  const lines: string[] = [];
  lines.push(`request: ${JSON.stringify(dbg.userRequest)}`);
  for (let i = 0; i < dbg.turns.length; i++) {
    const t = dbg.turns[i]!;
    const opsStr = JSON.stringify(t.ops);
    const opsOut = opsStr.length > MAX_OPS_CHARS
      ? `${opsStr.slice(0, MAX_OPS_CHARS)}… (+${opsStr.length - MAX_OPS_CHARS} chars)`
      : opsStr;
    lines.push(`turn ${i + 1}/${dbg.turns.length}: ops=${opsOut}`);
    lines.push(`  → outcome: ${t.outcome || 'unknown'}`);
    if (t.sentBack) {
      const snip = t.sentBack.length > MAX_SENT_CHARS
        ? `${t.sentBack.slice(0, MAX_SENT_CHARS)}…`
        : t.sentBack;
      lines.push(`  → sent back: ${snip}`);
    }
  }
  lines.push(`(unset TABLETAMER_DEBUG to hide this block)`);
  const out = lines.length > MAX_LINES
    ? [...lines.slice(0, MAX_LINES - 1), `… (+${lines.length - MAX_LINES + 1} more lines)`]
    : lines;
  for (const line of out) {
    const prefixed = `    [debug] ${line}`;
    stdout.write((useColor ? `\x1b[2m${prefixed}\x1b[0m` : prefixed) + '\n');
  }
}

export interface RunCliResult {
  exitCode: number;
  stderr: string;
}

export async function runCli(argv: string[], opts: CliRunnerOptions = {}): Promise<RunCliResult> {
  const stderr: string[] = [];
  const fail = (code: number, msg: string): RunCliResult => {
    stderr.push(msg);
    return { exitCode: code, stderr: stderr.join('\n') };
  };

  if (argv.length === 0) {
    return fail(1, 'tabletamer: REPL mode requires a CSV path. Usage: tabletamer <input.csv> | tabletamer execute <flow> --input <csv> --output <jsonl>');
  }

  if (argv[0] === 'execute') {
    return runExecute(argv.slice(1), opts, stderr);
  }
  if (argv[0]?.startsWith('-')) {
    return fail(1, `tabletamer: unrecognized option ${argv[0]}`);
  }
  // REPL mode
  return runRepl(argv, opts, stderr);
}

async function runExecute(rest: string[], opts: CliRunnerOptions, stderr: string[]): Promise<RunCliResult> {
  const fail = (code: number, msg: string): RunCliResult => {
    stderr.push(msg);
    return { exitCode: code, stderr: stderr.join('\n') };
  };

  if (rest.length === 0) return fail(1, 'tabletamer execute: missing <flow> argument');

  const flowArg = rest[0]!;
  let inputArg: string | undefined;
  let outputArg: string | undefined;
  for (let i = 1; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === '--input') inputArg = rest[++i];
    else if (a === '--output') outputArg = rest[++i];
    else if (a.startsWith('--input=')) inputArg = a.slice('--input='.length);
    else if (a.startsWith('--output=')) outputArg = a.slice('--output='.length);
    else return fail(1, `tabletamer execute: unrecognized argument ${a}`);
  }
  if (!outputArg) return fail(1, 'tabletamer execute: --output is required');

  const flowPath = await resolveFile(flowArg);
  if (!flowPath) return fail(2, `tabletamer execute: cannot read ${flowArg}`);
  const flowDir = path.dirname(flowPath);
  let flow: { version?: number; source?: string; spec?: unknown };
  try {
    flow = JSON.parse(await readFile(flowPath, 'utf8'));
  } catch (e) {
    return fail(2, `tabletamer execute: ${flowPath}: invalid JSON: ${(e as Error).message}`);
  }
  if (flow.version !== 1) return fail(2, `tabletamer execute: ${flowPath}: version must be 1 (got ${flow.version ?? 'undefined'})`);
  let spec: Spec;
  try {
    spec = validateSpec(flow.spec);
  } catch (e) {
    return fail(2, `tabletamer execute: ${flowPath}: ${(e as Error).message}`);
  }

  const csvCandidate = inputArg ?? flow.source;
  if (!csvCandidate) return fail(1, 'tabletamer execute: no input CSV (no --input and flow has no source)');
  const csvPath = path.isAbsolute(csvCandidate) ? csvCandidate : path.join(flowDir, csvCandidate);
  const outputPath = path.isAbsolute(outputArg) ? outputArg : path.join(flowDir, outputArg);

  let runner: HeadlessRunner;
  try {
    runner = createHeadlessRunner(opts);
    await runner.loadInput(csvPath);
  } catch (e) {
    return fail(3, `tabletamer execute: ${(e as Error).message}`);
  }
  try {
    await runner.setSpec(spec);
  } catch (e) {
    return fail(3, `tabletamer execute: ${(e as Error).message}`);
  }
  try {
    await runner.exportAs(outputPath);
  } catch (e) {
    return fail(4, `tabletamer execute: ${(e as Error).message}`);
  }
  return { exitCode: 0, stderr: stderr.join('\n') };
}

async function resolveFile(p: string): Promise<string | undefined> {
  const tried = [p];
  if (!path.isAbsolute(p)) tried.push(path.join('test-cases', p));
  for (const cand of tried) {
    try {
      await readFile(cand, 'utf8');
      return cand;
    } catch {}
  }
  return undefined;
}

async function runRepl(argv: string[], opts: CliRunnerOptions, stderr: string[]): Promise<RunCliResult> {
  const inputPath = argv[0]!;
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const runner = createCliRunner({ ...opts, quiet: false, stdout });
  try {
    await runner.loadInput(inputPath);
  } catch (e) {
    stderr.push(`tabletamer: ${(e as Error).message}`);
    return { exitCode: 3, stderr: stderr.join('\n') };
  }
  let activeRequest: AbortController | null = null;
  const rl = readline.createInterface({ input: stdin as NodeJS.ReadableStream, output: stdout as NodeJS.WritableStream, terminal: false });
  const onSigint = () => {
    if (activeRequest) activeRequest.abort();
    else rl.close();
  };
  process.on('SIGINT', onSigint);
  stdout.write("Type 'exit' to exit. Ctrl-C cancels a running request (or exits when idle).\n");
  try {
    stdout.write('> ');
    for await (const line of rl) {
      const text = line.trim();
      if (!text) {
        stdout.write('> ');
        continue;
      }
      if (text === 'exit' || text === '/exit') break;
      const ctrl = new AbortController();
      activeRequest = ctrl;
      try {
        await runner.request(text, { signal: ctrl.signal });
      } catch (e) {
        renderError(e as Error, stdout);
      } finally {
        activeRequest = null;
      }
      stdout.write('> ');
    }
  } finally {
    rl.close();
    process.off('SIGINT', onSigint);
  }
  return { exitCode: 0, stderr: stderr.join('\n') };
}

if (import.meta.main) {
  loadEnv();
  const result = await runCli(process.argv.slice(2));
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  process.exit(result.exitCode);
}
