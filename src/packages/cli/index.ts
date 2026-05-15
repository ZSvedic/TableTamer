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
} from '@tamedtable/core';
import {
  createHeadlessRunner,
  type ChunkUpdate,
  type HeadlessRunner,
  type HeadlessRunnerOptions,
  type PlanItem,
  type RequestDebugInfo,
} from '@tamedtable/headless';

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

export interface RunCliResult {
  exitCode: number;
  stderr: string;
}

const HELP_TEXT = `tamedtable — natural-language ETL for CSV files

Usage:
  tamedtable <input.csv>                          Start the interactive REPL.
  tamedtable execute <flow> --output <out.jsonl>  Replay a saved .flow against a CSV (no LLM call).
                                                  --input <csv> overrides flow.source.
  tamedtable --help, -h                           Show this message.

REPL:
  <natural-language request>   e.g. "normalize country names"
  :help                        Show this message.
  :undo                        Pop the last transformation and replay (no LLM call).
  :save <out.jsonl>            Write current rows to a JSONL file (cwd-relative).
  :save-flow <out.flow>        Write the current spec as a replayable .flow file.
  exit                         Leave the REPL (:exit also accepted).
  Ctrl-C                       Cancel a running request, or exit when idle.

Environment (full table in README.md):
  ANTHROPIC_API_KEY        required (loaded from .env if missing or empty)
  TAMEDTABLE_MODEL         default claude-sonnet-4-6   patch turn
  TAMEDTABLE_CELL_MODEL    default claude-sonnet-4-5   per-cell turn
  TAMEDTABLE_BATCH_SIZE    default 20                  rows per LLM request
  TAMEDTABLE_CHUNK_SIZE    default 5                   concurrent requests
  TAMEDTABLE_RPM           default 40                  per-process rate cap
  TAMEDTABLE_DEBUG         unset                       print per-turn debug block on failure

Exit codes (execute mode):
  0  success                3  CSV / transformation error
  1  bad invocation         4  output write error
  2  bad .flow file

Docs: README.md, spec/behavior.md.
`;

// ── Pure formatting helpers ────────────────────────────────────────────────

function stringify(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function renderTable(spec: Spec, rows: Row[]): string {
  const cols = spec.columns.map((c) => c.id);
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => stringify(r[c]).length)));
  const fmt = (vals: string[]) => ' ' + vals.map((v, i) => v.padEnd(widths[i]!)).join(' | ');
  const header = fmt(cols);
  const body = rows.map((r) => fmt(cols.map((c) => stringify(r[c])))).join('\n');
  return body.length ? `${header}\n${body}` : header;
}

function describeTransformation(t: Transformation): string {
  switch (t.kind) {
    case 'filter':
      return `filter rows where ${trunc('js' in t.pred ? t.pred.js : '<llm>', 60)}`;
    case 'select':
      return `keep columns: ${t.columns.join(', ')}`;
    case 'sort':
      return `sort by: ${t.by.map((b) => `${typeof b.key === 'string' ? b.key : '<expr>'} ${b.dir}`).join(', ')}`;
    case 'mutate': {
      const cols = Array.isArray(t.columns) ? t.columns.join(', ') : t.columns;
      return 'js' in t.value
        ? `set '${cols}' via JS: ${trunc(t.value.js, 60)}`
        : `set '${cols}' via LLM: ${trunc(t.value.llm, 80)}`;
    }
  }
}

function formatPlanItem(item: PlanItem): string {
  switch (item.kind) {
    case 'add-column':           return `add column '${item.id}'`;
    case 'remove-column':        return `remove column '${item.id}'`;
    case 'reorder-columns':      return `reorder columns to: ${item.to.join(', ')}`;
    case 'add-transformation':   return `apply: ${describeTransformation(item.transformation)}`;
    case 'remove-transformation': return `undo: ${describeTransformation(item.transformation)}`;
  }
}

function userFacingMessage(message: string): string {
  if (message.startsWith('Runner: recovery budget exhausted'))
    return "Couldn't apply that change after 3 attempts. Try rephrasing or breaking it into smaller steps.";
  if (message === 'Runner: cancelled') return 'Cancelled.';
  if (message === 'Runner: a request is already in progress.') return 'A request is already running.';
  return message;
}

function renderError(err: Error, stdout: NodeJS.WritableStream): void {
  stdout.write(`error: ${userFacingMessage(err.message)}\n`);
  if (!process.env.TAMEDTABLE_DEBUG) return;
  const dbg = (err as Error & { debug?: RequestDebugInfo }).debug;
  if (!dbg) return;
  const useColor = Boolean((stdout as { isTTY?: boolean }).isTTY);
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}… (+${s.length - n} chars)` : s);
  const lines = [`request: ${JSON.stringify(dbg.userRequest)}`];
  dbg.turns.forEach((t, i) => {
    lines.push(`turn ${i + 1}/${dbg.turns.length}: ops=${clip(JSON.stringify(t.ops), 200)}`);
    lines.push(`  → outcome: ${t.outcome || 'unknown'}`);
    if (t.sentBack) lines.push(`  → sent back: ${trunc(t.sentBack, 120)}`);
  });
  lines.push('(unset TAMEDTABLE_DEBUG to hide this block)');
  const MAX = 20;
  const out = lines.length > MAX ? [...lines.slice(0, MAX - 1), `… (+${lines.length - MAX + 1} more lines)`] : lines;
  const wrap = (s: string) => `    [debug] ${s}`;
  for (const line of out) stdout.write((useColor ? `\x1b[2m${wrap(line)}\x1b[0m` : wrap(line)) + '\n');
}

// ── CLI runner (REPL printing wrapper around headless) ─────────────────────

class CliRunnerImpl implements CliRunner {
  private headless: HeadlessRunner;
  private stdout: NodeJS.WritableStream;
  private quiet: boolean;

  constructor(opts: CliRunnerOptions) {
    this.stdout = opts.stdout ?? process.stdout;
    this.quiet = opts.quiet ?? true;
    this.headless = createHeadlessRunner({
      ...opts,
      onChunk: opts.onChunk ?? ((u) => this.printChunk(u)),
      onPlan: opts.onPlan ?? ((items) => this.printPlan(items)),
    });
  }

  private printChunk(u: ChunkUpdate): void {
    if (this.quiet) return;
    const before = u.before === null || u.before === undefined ? '' : String(u.before);
    const after = u.after === null || u.after === undefined ? 'null' : String(u.after);
    this.stdout.write(`running … row ${u.rowIndex + 1}: ${u.column} "${before}" → "${after}"\n`);
  }

  private printPlan(items: PlanItem[]): void {
    if (this.quiet || items.length === 0) return;
    this.stdout.write('plan:\n');
    for (const item of items) this.stdout.write(`  • ${formatPlanItem(item)}\n`);
  }

  private printTable(): void {
    this.stdout.write(renderTable(this.headless.currentSpec(), this.headless.currentRows()) + '\n');
  }

  async loadInput(path: string): Promise<void> {
    await this.headless.loadInput(path);
    if (!this.quiet) this.printTable();
  }
  async request(text: string, opts?: { signal?: AbortSignal; onChunk?: (u: ChunkUpdate) => void }): Promise<void> {
    await this.headless.request(text, opts);
    if (!this.quiet) this.printTable();
  }
  async setSpec(spec: Spec): Promise<void> { await this.headless.setSpec(spec); }
  currentRows(): Row[] { return this.headless.currentRows(); }
  currentSpec(): Spec { return this.headless.currentSpec(); }
  async exportAs(path: string): Promise<void> { await this.headless.exportAs(path); }
}

export function createCliRunner(opts: CliRunnerOptions = {}): CliRunner {
  return new CliRunnerImpl(opts);
}

// ── Slash commands ─────────────────────────────────────────────────────────

export type SlashCommandAction = 'exit' | 'handled' | 'unhandled';

type SlashHandler = (arg: string, runner: CliRunner, stdout: NodeJS.WritableStream) => Promise<void> | void;

function splitCmd(text: string): { cmd: string; arg: string } {
  const sp = text.indexOf(' ');
  return sp < 0 ? { cmd: text, arg: '' } : { cmd: text.slice(0, sp), arg: text.slice(sp + 1).trim() };
}

async function runWithErrorRender(stdout: NodeJS.WritableStream, fn: () => Promise<void>): Promise<void> {
  try { await fn(); } catch (e) { renderError(e as Error, stdout); }
}

const SLASH: Record<string, SlashHandler> = {
  ':help'(_arg, _r, stdout) { stdout.write(HELP_TEXT); },

  async ':undo'(_arg, runner, stdout) {
    const spec = runner.currentSpec();
    if (spec.transformations.length === 0) { stdout.write('nothing to undo.\n'); return; }
    const popped = spec.transformations[spec.transformations.length - 1] as Transformation;
    await runWithErrorRender(stdout, async () => {
      await runner.setSpec({ ...spec, transformations: spec.transformations.slice(0, -1) });
      stdout.write(`undid: ${describeTransformation(popped)}\n`);
      stdout.write(renderTable(runner.currentSpec(), runner.currentRows()) + '\n');
    });
  },

  async ':save'(arg, runner, stdout) {
    if (!arg) { stdout.write(':save: missing path. Usage: :save <output.jsonl>\n'); return; }
    await runWithErrorRender(stdout, async () => {
      await runner.exportAs(arg);
      stdout.write(`saved ${runner.currentRows().length} rows to ${arg}\n`);
    });
  },

  async ':save-flow'(arg, runner, stdout) {
    if (!arg) { stdout.write(':save-flow: missing path. Usage: :save-flow <out.flow>\n'); return; }
    const spec = runner.currentSpec();
    if (!spec.table) { stdout.write(':save-flow: spec has no source CSV table; cannot write a flow.\n'); return; }
    await runWithErrorRender(stdout, async () => {
      const flowDir = path.dirname(path.resolve(arg));
      const absSource = path.resolve(spec.table!);
      const rel = path.relative(flowDir, absSource);
      const source = rel.startsWith('..') ? absSource : rel;
      await writeFile(arg, JSON.stringify({ version: 1, source, spec }, null, 2) + '\n', 'utf8');
      stdout.write(`saved flow (${spec.transformations.length} transformations) to ${arg}\n`);
    });
  },
};

/**
 * Handle REPL slash commands and bare-word aliases. Returns:
 *  - `'exit'` for `exit` / `:exit` (caller should break out of the loop).
 *  - `'handled'` for any recognized command (caller reprints prompt and continues).
 *  - `'unhandled'` for any other input (caller passes it through to the LLM).
 * Exported so tests can drive it directly without standing up the readline loop.
 */
export async function handleSlashCommand(
  text: string,
  runner: CliRunner,
  stdout: NodeJS.WritableStream
): Promise<SlashCommandAction> {
  if (text === 'exit' || text === ':exit') return 'exit';
  const { cmd, arg } = splitCmd(text);
  const handler = SLASH[cmd];
  if (!handler) return 'unhandled';
  await handler(arg, runner, stdout);
  return 'handled';
}

// ── Entry point: runCli + subcommands ──────────────────────────────────────

function makeFail(stderr: string[]) {
  return (code: number, msg: string): RunCliResult => {
    stderr.push(msg);
    return { exitCode: code, stderr: stderr.join('\n') };
  };
}

export async function runCli(argv: string[], opts: CliRunnerOptions = {}): Promise<RunCliResult> {
  const stderr: string[] = [];
  const fail = makeFail(stderr);

  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    (opts.stdout ?? process.stdout).write(HELP_TEXT);
    return { exitCode: 0, stderr: '' };
  }
  if (argv.length === 0) return fail(1, 'tamedtable: REPL mode requires a CSV path. Try --help for usage.');
  if (argv[0] === 'execute') return runExecute(argv.slice(1), opts, stderr);
  if (argv[0]?.startsWith('-')) return fail(1, `tamedtable: unrecognized option ${argv[0]} (try --help)`);
  return runRepl(argv, opts, stderr);
}

function parseExecuteFlags(rest: string[]): { flow?: string; input?: string; output?: string; err?: string } {
  if (rest.length === 0) return { err: 'missing <flow> argument' };
  const out: { flow?: string; input?: string; output?: string; err?: string } = { flow: rest[0] };
  for (let i = 1; i < rest.length; i++) {
    const a = rest[i]!;
    const eq = a.indexOf('=');
    const key = eq < 0 ? a : a.slice(0, eq);
    const inline = eq < 0 ? undefined : a.slice(eq + 1);
    if (key === '--input') out.input = inline ?? rest[++i];
    else if (key === '--output') out.output = inline ?? rest[++i];
    else return { err: `unrecognized argument ${a}` };
  }
  return out;
}

async function runExecute(rest: string[], opts: CliRunnerOptions, stderr: string[]): Promise<RunCliResult> {
  const fail = makeFail(stderr);
  const flags = parseExecuteFlags(rest);
  if (flags.err) return fail(1, `tamedtable execute: ${flags.err}`);
  if (!flags.output) return fail(1, 'tamedtable execute: --output is required');

  const flowPath = await resolveFile(flags.flow!);
  if (!flowPath) return fail(2, `tamedtable execute: cannot read ${flags.flow}`);
  const flowDir = path.dirname(flowPath);

  let flow: { version?: number; source?: string; spec?: unknown };
  try {
    flow = JSON.parse(await readFile(flowPath, 'utf8'));
  } catch (e) {
    return fail(2, `tamedtable execute: ${flowPath}: invalid JSON: ${(e as Error).message}`);
  }
  if (flow.version !== 1) return fail(2, `tamedtable execute: ${flowPath}: version must be 1 (got ${flow.version ?? 'undefined'})`);

  let spec: Spec;
  try {
    spec = validateSpec(flow.spec);
  } catch (e) {
    return fail(2, `tamedtable execute: ${flowPath}: ${(e as Error).message}`);
  }

  const csvCandidate = flags.input ?? flow.source;
  if (!csvCandidate) return fail(1, 'tamedtable execute: no input CSV (no --input and flow has no source)');
  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(flowDir, p));
  const csvPath = abs(csvCandidate);
  const outputPath = abs(flags.output);

  const runner = createHeadlessRunner(opts);
  try { await runner.loadInput(csvPath); } catch (e) { return fail(3, `tamedtable execute: ${(e as Error).message}`); }
  try { await runner.setSpec(spec); }      catch (e) { return fail(3, `tamedtable execute: ${(e as Error).message}`); }
  try { await runner.exportAs(outputPath); } catch (e) { return fail(4, `tamedtable execute: ${(e as Error).message}`); }
  return { exitCode: 0, stderr: stderr.join('\n') };
}

async function resolveFile(p: string): Promise<string | undefined> {
  // The spec/test-cases/ fallback is a dev convenience so feature files can
  // name a flow by bare filename; harmless for real users (path won't exist).
  const candidates = path.isAbsolute(p) ? [p] : [p, path.join('..', 'spec', 'test-cases', p)];
  for (const cand of candidates) {
    try { await readFile(cand, 'utf8'); return cand; } catch {}
  }
  return undefined;
}

async function runRepl(argv: string[], opts: CliRunnerOptions, stderr: string[]): Promise<RunCliResult> {
  const stdin = opts.stdin ?? process.stdin;
  const stdout = opts.stdout ?? process.stdout;
  const runner = createCliRunner({ ...opts, quiet: false, stdout });
  try {
    await runner.loadInput(argv[0]!);
  } catch (e) {
    stderr.push(`tamedtable: ${(e as Error).message}`);
    return { exitCode: 3, stderr: stderr.join('\n') };
  }
  let activeRequest: AbortController | null = null;
  const rl = readline.createInterface({ input: stdin as NodeJS.ReadableStream, output: stdout as NodeJS.WritableStream, terminal: false });
  const onSigint = () => { activeRequest ? activeRequest.abort() : rl.close(); };
  process.on('SIGINT', onSigint);
  stdout.write("Commands: :help, :undo, :save, :save-flow, exit. Ctrl-C cancels a running request (or exits when idle).\n");
  try {
    stdout.write('> ');
    for await (const line of rl) {
      const text = line.trim();
      if (!text) { stdout.write('> '); continue; }
      const action = await handleSlashCommand(text, runner, stdout);
      if (action === 'exit') break;
      if (action === 'handled') { stdout.write('> '); continue; }
      const ctrl = new AbortController();
      activeRequest = ctrl;
      try { await runner.request(text, { signal: ctrl.signal }); }
      catch (e) { renderError(e as Error, stdout); }
      finally { activeRequest = null; }
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
