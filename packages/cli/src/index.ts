#!/usr/bin/env -S bun run
import * as readline from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import {
  loadEnv,
  validateSpec,
  type Row,
  type Spec,
  type Transformation,
} from '@tabletamer/core';
import {
  createHeadlessRunner,
  type ChunkUpdate,
  type HeadlessRunner,
  type HeadlessRunnerOptions,
  type PlanItem,
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
    const onPlan = (items: PlanItem[]) => {
      if (this.quiet || items.length === 0) return;
      this.stdout.write('plan:\n');
      for (const item of items) this.stdout.write(`  • ${formatPlanItem(item)}\n`);
    };
    this.headless = createHeadlessRunner({
      ...opts,
      onChunk: opts.onChunk ?? onChunk,
      onPlan: opts.onPlan ?? onPlan,
    });
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

function formatPlanItem(item: PlanItem): string {
  switch (item.kind) {
    case 'add-column':
      return `add column '${item.id}'`;
    case 'remove-column':
      return `remove column '${item.id}'`;
    case 'reorder-columns':
      return `reorder columns to: ${item.to.join(', ')}`;
    case 'add-transformation':
      return `apply: ${describeTransformation(item.transformation)}`;
    case 'remove-transformation':
      return `undo: ${describeTransformation(item.transformation)}`;
  }
}

export type SlashCommandAction = 'exit' | 'handled' | 'unhandled';

/**
 * Handle REPL slash commands and bare-word aliases. Returns:
 *  - `'exit'` for `exit` / `/exit` (caller should break out of the loop).
 *  - `'handled'` for `/help` / `/undo` (caller should reprint the prompt and continue).
 *  - `'unhandled'` for any other input (caller should pass it through to the LLM).
 * Exported so tests can drive it directly without standing up the readline loop.
 */
export async function handleSlashCommand(
  text: string,
  runner: CliRunner,
  stdout: NodeJS.WritableStream
): Promise<SlashCommandAction> {
  if (text === 'exit' || text === '/exit') return 'exit';
  if (text === '/help') {
    stdout.write(HELP_TEXT);
    return 'handled';
  }
  if (text === '/undo') {
    const spec = runner.currentSpec();
    if (spec.transformations.length === 0) {
      stdout.write('nothing to undo.\n');
      return 'handled';
    }
    const popped = spec.transformations[spec.transformations.length - 1] as Transformation;
    try {
      await runner.setSpec({ ...spec, transformations: spec.transformations.slice(0, -1) });
      stdout.write(`undid: ${describeTransformation(popped)}\n`);
      stdout.write(renderTable(runner.currentSpec(), runner.currentRows()) + '\n');
    } catch (e) {
      renderError(e as Error, stdout);
    }
    return 'handled';
  }
  if (text === '/save-flow' || text.startsWith('/save-flow ')) {
    const rest = text === '/save-flow' ? '' : text.slice('/save-flow '.length).trim();
    if (!rest) {
      stdout.write('/save-flow: missing path. Usage: /save-flow <out.flow>\n');
      return 'handled';
    }
    const spec = runner.currentSpec();
    const sourceTable = spec.table;
    if (!sourceTable) {
      stdout.write('/save-flow: spec has no source CSV table; cannot write a flow.\n');
      return 'handled';
    }
    try {
      const flowDir = path.dirname(path.resolve(rest));
      const absSource = path.resolve(sourceTable);
      const relSource = path.relative(flowDir, absSource);
      // Use a clean relative path when the source sits at or below the flow
      // file's directory; otherwise fall back to an absolute path rather than
      // emit a ..-heavy traversal.
      const sourceForFlow = relSource.startsWith('..') ? absSource : relSource;
      const flow = { version: 1, source: sourceForFlow, spec };
      await writeFile(rest, JSON.stringify(flow, null, 2) + '\n', 'utf8');
      stdout.write(`saved flow (${spec.transformations.length} transformations) to ${rest}\n`);
    } catch (e) {
      renderError(e as Error, stdout);
    }
    return 'handled';
  }
  if (text === '/save' || text.startsWith('/save ')) {
    const rest = text === '/save' ? '' : text.slice('/save '.length).trim();
    if (!rest) {
      stdout.write('/save: missing path. Usage: /save <output.jsonl>\n');
      return 'handled';
    }
    try {
      await runner.exportAs(rest);
      stdout.write(`saved ${runner.currentRows().length} rows to ${rest}\n`);
    } catch (e) {
      renderError(e as Error, stdout);
    }
    return 'handled';
  }
  return 'unhandled';
}

function describeTransformation(t: Transformation): string {
  const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  switch (t.kind) {
    case 'filter': {
      const body = 'js' in t.pred ? t.pred.js : '<llm>';
      return `filter rows where ${trunc(body, 60)}`;
    }
    case 'select':
      return `keep columns: ${t.columns.join(', ')}`;
    case 'sort': {
      const keys = t.by
        .map((b) => `${typeof b.key === 'string' ? b.key : '<expr>'} ${b.dir}`)
        .join(', ');
      return `sort by: ${keys}`;
    }
    case 'mutate': {
      const cols = Array.isArray(t.columns) ? t.columns.join(', ') : t.columns;
      if ('js' in t.value) return `set '${cols}' via JS: ${trunc(t.value.js, 60)}`;
      return `set '${cols}' via LLM: ${trunc(t.value.llm, 80)}`;
    }
  }
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

const HELP_TEXT = `tabletamer — natural-language ETL for CSV files

Usage:
  tabletamer <input.csv>                          Start the interactive REPL.
  tabletamer execute <flow> --output <out.jsonl>  Replay a saved .flow against a CSV (no LLM call).
                                                  --input <csv> overrides flow.source.
  tabletamer --help, -h                           Show this message.

REPL:
  <natural-language request>   e.g. "normalize country names"
  /help                        Show this message.
  /undo                        Pop the last transformation and replay (no LLM call).
  /save <out.jsonl>            Write current rows to a JSONL file (cwd-relative).
  /save-flow <out.flow>        Write the current spec as a replayable .flow file.
  exit                         Leave the REPL (/exit also accepted).
  Ctrl-C                       Cancel a running request, or exit when idle.

Environment (full table in README.md):
  ANTHROPIC_API_KEY        required (loaded from .env if missing or empty)
  TABLETAMER_MODEL         default claude-sonnet-4-5   patch turn
  TABLETAMER_CELL_MODEL    default claude-sonnet-4-5   per-cell turn
  TABLETAMER_BATCH_SIZE    default 20                  rows per LLM request
  TABLETAMER_CHUNK_SIZE    default 5                   concurrent requests
  TABLETAMER_RPM           default 40                  per-process rate cap
  TABLETAMER_DEBUG         unset                       print per-turn debug block on failure

Exit codes (execute mode):
  0  success                3  CSV / transformation error
  1  bad invocation         4  output write error
  2  bad .flow file

Docs: README.md, spec/cli.md.
`;

export async function runCli(argv: string[], opts: CliRunnerOptions = {}): Promise<RunCliResult> {
  const stderr: string[] = [];
  const fail = (code: number, msg: string): RunCliResult => {
    stderr.push(msg);
    return { exitCode: code, stderr: stderr.join('\n') };
  };

  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    (opts.stdout ?? process.stdout).write(HELP_TEXT);
    return { exitCode: 0, stderr: '' };
  }

  if (argv.length === 0) {
    return fail(1, 'tabletamer: REPL mode requires a CSV path. Try --help for usage.');
  }

  if (argv[0] === 'execute') {
    return runExecute(argv.slice(1), opts, stderr);
  }
  if (argv[0]?.startsWith('-')) {
    return fail(1, `tabletamer: unrecognized option ${argv[0]} (try --help)`);
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
  stdout.write("Commands: /help, /undo, /save, /save-flow, exit. Ctrl-C cancels a running request (or exits when idle).\n");
  try {
    stdout.write('> ');
    for await (const line of rl) {
      const text = line.trim();
      if (!text) {
        stdout.write('> ');
        continue;
      }
      const action = await handleSlashCommand(text, runner, stdout);
      if (action === 'exit') break;
      if (action === 'handled') {
        stdout.write('> ');
        continue;
      }
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
