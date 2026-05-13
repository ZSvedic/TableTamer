import { generateText, tool, stepCountIs, jsonSchema } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import * as jsonpatch from 'fast-json-patch';
import {
  loadCsv,
  validateSpec,
  writeJsonl,
  type Row,
  type Spec,
  type Transformation,
  type Expr,
} from '@tabletamer/core';

export type ChunkUpdate = {
  transformationIndex: number;
  rowIndex: number;
  column: string;
  before: unknown;
  after: unknown;
};

export interface RequestDebugTurn {
  ops: unknown[];
  outcome: string;
  sentBack?: string;
}

export interface RequestDebugInfo {
  userRequest: string;
  turns: RequestDebugTurn[];
}

export type PlanItem =
  | { kind: 'add-column'; id: string }
  | { kind: 'remove-column'; id: string }
  | { kind: 'reorder-columns'; from: string[]; to: string[] }
  | { kind: 'add-transformation'; transformation: Transformation }
  | { kind: 'remove-transformation'; transformation: Transformation };

export interface HeadlessRunnerOptions {
  model?: string;
  cellModel?: string;
  apiKey?: string;
  baseURL?: string;
  chunkSize?: number;
  batchSize?: number;
  recoveryBudget?: number;
  maxRetries?: number;
  rpm?: number;
  onChunk?: (update: ChunkUpdate) => void;
  onPlan?: (items: PlanItem[]) => void;
  signal?: AbortSignal;
}

export interface HeadlessRunner {
  loadInput(path: string): Promise<void>;
  request(text: string, options?: { signal?: AbortSignal; onChunk?: (u: ChunkUpdate) => void }): Promise<void>;
  setSpec(spec: Spec): Promise<void>;
  currentRows(): Row[];
  currentSpec(): Spec;
  exportAs(path: string): Promise<void>;
}

const DEFAULT_MODEL = process.env.TABLETAMER_MODEL ?? 'claude-sonnet-4-5';
const DEFAULT_CELL_MODEL = process.env.TABLETAMER_CELL_MODEL ?? 'claude-sonnet-4-5';
const DEFAULT_MAX_RETRIES = 6;
const DEFAULT_RPM = Number(process.env.TABLETAMER_RPM ?? 40);
const DEFAULT_CHUNK_SIZE = Number(process.env.TABLETAMER_CHUNK_SIZE ?? 5);
const DEFAULT_BATCH_SIZE = Number(process.env.TABLETAMER_BATCH_SIZE ?? 20);

const BATCH_SYSTEM_PROMPT = `You will process several independent micro-tasks. Apply each task's instructions exactly to its own content. Return ONLY a JSON array of entries, one per task, in the same order as the tasks — no prose, no explanation, no markdown fences. Each entry is either a string (the per-task result) or the JSON literal null (when the per-task instructions say to reply null).`;

const rateLimiter = (() => {
  const timestamps: number[] = [];
  let limit = DEFAULT_RPM;
  return {
    setLimit(rpm: number) {
      if (rpm > 0 && rpm < limit) limit = rpm;
    },
    async acquire(signal?: AbortSignal): Promise<void> {
      while (true) {
        if (signal?.aborted) throw new Error('Runner: cancelled');
        const now = Date.now();
        while (timestamps.length && now - timestamps[0]! > 60_000) timestamps.shift();
        if (timestamps.length < limit) {
          timestamps.push(now);
          return;
        }
        const waitMs = 60_000 - (now - timestamps[0]!);
        await new Promise((r) => setTimeout(r, Math.min(waitMs, 1_000)));
      }
    },
  };
})();

const SYSTEM_PROMPT = `You are TableTamer, an LLM that edits a JSON Spec describing transformations over a tabular dataset. The user describes a transformation in natural language; you reply by calling the apply_spec_patch tool with a list of RFC 6902 JSON Patch operations that mutate the current spec into the desired one. Do not call the tool more than once per turn. Do not reply with text — always use the tool.

Key rules:
- New requests are additive. Use {op:"add", path:"/transformations/-", value:<Transformation>} to append. Never remove or replace a prior transformation unless the user explicitly says to undo or replace it.
- Choose {js} only when the rule is purely structural (filter by exact column value, dedupe by key, simple boolean predicates). Choose {llm} for any task that requires semantic understanding (normalize phone/country/date, translate, classify, summarize, infer). The words "normalize", "canonicalize", "translate", "format", "infer", "classify" all signal {llm}. Pick {llm} when unsure.
- Column targeting: pick the target column from explicit names in the user request ("DOB", "phone column", "Country") or the keyword list annotated on each few-shot below. NEVER default to Phone, Country, or any other column when the request doesn't hint at it — if you can't identify a target, emit an empty operations array and let the recovery loop surface the ambiguity.

Spec shape (V1):
{
  table?: string,
  columns: [{id: string, label?, format?}],
  transformations: Transformation[],
  filter?, sort?, page?, summary?
}

Patchable paths — every path in the spec is fair game for RFC 6902 ops, not just /transformations:
- /transformations/- (append) is the most common edit.
- /columns is also patchable (add, remove, reorder). To "add column X with computed value Y", emit ONE patch with TWO ops, in order: first {op:"add", path:"/columns/-", value:{id:"X"}}, then {op:"add", path:"/transformations/-", value:{kind:"mutate", columns:"X", value:<Expr>}} that populates X. Without the second op, X exists but stays empty.
- /filter, /sort, /page are valid targets when the request is about a single shallow setting.

Transformation grammar (V1):
- {kind: "filter", pred: Expr}                                     — keep rows where pred(row, i, rows) is truthy
- {kind: "mutate", columns: string | string[], value: Expr}        — set one or more columns from value(row, i, rows)
- {kind: "select", columns: string[]}                              — keep only these columns
- {kind: "sort", by: [{key: string | Expr, dir: "asc"|"desc"}]}

Expr is one of:
- {js: string}            — arrow function BODY (not full \"() => ...\"); signature (row, index, allRows). Example: "row.Country === 'USA'"
- {llm: string}            — prompt template with {Column} placeholders. The template is evaluated per row; {Column} is replaced with that row's value. The model's reply (trimmed, lowercased "null" → null) becomes the new cell value. Cell prompts MUST end with explicit format constraints: "Reply with ONLY the result and nothing else. If the input cannot be processed, reply with the literal word: null".

Few-shot:
1) "Show only customers in the USA"
   add {kind:"filter", pred:{js:"row.Country === 'USA'"}}
2) "Normalize phone numbers" — keywords: phone, phones, mobile, cell, telephone
   add {kind:"mutate", columns:"Phone", value:{llm:"Convert this phone number to E.164 format (the canonical international format: a + followed by country code and the remaining digits, no spaces, dashes, parentheses, or dots). Input phone: '{Phone}'. Customer country: '{Country}'. Use ONLY the digits that appear in the input — do not infer, add, or guess area codes or extra digits that are not present. If the input already begins with a leading 00 or +, strip the prefix and treat the rest as country code + national number. Reply with ONLY the resulting E.164 string (e.g. +12005551234) and nothing else. If the number lacks enough information to normalize unambiguously, or is empty, reply with the literal word: null"}}
3) "Normalize country names" — keywords: country, countries, nation, nationality
   add {kind:"mutate", columns:"Country", value:{llm:"Normalize this country name to its canonical English form. Input: '{Country}'. Reply with ONLY the canonical English name and nothing else. Examples: USA→United States, UK→United Kingdom, England→United Kingdom, Deutschland→Germany, The Bahamas→Bahamas. If empty or unrecognizable, reply with the literal word: null"}}
4) "Normalize DOB formats" — keywords: DOB, dob, date of birth, birthdate, birthday, born
   add {kind:"mutate", columns:"DOB", value:{llm:"Convert this date of birth to ISO 8601 format YYYY-MM-DD. Input: '{DOB}'. Reply with ONLY the ISO date and nothing else. If the input is empty, 'NA', '-', or otherwise indicates missing data, reply with the literal word: null"}}
5) "Remove duplicate rows by Email" — keep the FIRST occurrence by Email; drop later duplicates. Use EXACTLY this predicate (it's idiomatic and uses (row, i, rows) signature):
   add {kind:"filter", pred:{js:"rows.findIndex(r => r.Email === row.Email) === i"}}

JSON Patch operations target /transformations/- for append. The runtime applies the patch, validates against the spec schema, runs the transformations, and commits. On any failure, you will get the error in the next user turn and must emit a corrected patch.`;

const PATCH_INPUT_SCHEMA = jsonSchema<{ operations: unknown[] }>({
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['add', 'remove', 'replace', 'move', 'copy', 'test'] },
          path: { type: 'string' },
          from: { type: 'string' },
          value: {},
        },
        required: ['op', 'path'],
        additionalProperties: false,
      },
    },
  },
  required: ['operations'],
  additionalProperties: false,
});

class HeadlessRunnerImpl implements HeadlessRunner {
  private opts: HeadlessRunnerOptions;
  private sourceRows: Row[] = [];
  private sourcePath = '';
  private spec: Spec = { columns: [], transformations: [] };
  private derivedRows: Row[] = [];
  private modelCache: ReturnType<ReturnType<typeof createAnthropic>> | undefined;
  private cellModelCache: ReturnType<ReturnType<typeof createAnthropic>> | undefined;
  private providerCache: ReturnType<typeof createAnthropic> | undefined;
  private cellResultCache = new Map<string, unknown>();
  private loaded = false;
  private busy = false;

  constructor(opts: HeadlessRunnerOptions = {}) {
    this.opts = opts;
    if (opts.rpm) rateLimiter.setLimit(opts.rpm);
    if (process.env.TABLETAMER_RPM) rateLimiter.setLimit(Number(process.env.TABLETAMER_RPM));
  }

  private provider(): ReturnType<typeof createAnthropic> {
    if (this.providerCache) return this.providerCache;
    const apiKey = this.opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Export it in your shell or pass `apiKey` to createHeadlessRunner().'
      );
    }
    const rawBase = this.opts.baseURL ?? process.env.ANTHROPIC_BASE_URL;
    const baseURL = rawBase
      ? rawBase.replace(/\/$/, '').endsWith('/v1')
        ? rawBase.replace(/\/$/, '')
        : `${rawBase.replace(/\/$/, '')}/v1`
      : 'https://api.anthropic.com/v1';
    this.providerCache = createAnthropic({ apiKey, baseURL });
    return this.providerCache;
  }

  private model(): ReturnType<ReturnType<typeof createAnthropic>> {
    if (this.modelCache) return this.modelCache;
    this.modelCache = this.provider()(this.opts.model ?? DEFAULT_MODEL);
    return this.modelCache;
  }

  private cellModel(perCellModel?: string): ReturnType<ReturnType<typeof createAnthropic>> {
    if (perCellModel) return this.provider()(perCellModel);
    if (this.cellModelCache) return this.cellModelCache;
    this.cellModelCache = this.provider()(this.opts.cellModel ?? DEFAULT_CELL_MODEL);
    return this.cellModelCache;
  }

  async loadInput(path: string): Promise<void> {
    const { spec, rows, sourcePath } = await loadCsv(path);
    this.sourceRows = rows;
    this.sourcePath = sourcePath;
    this.spec = spec;
    this.derivedRows = rows.slice();
    this.cellResultCache.clear();
    this.loaded = true;
  }

  currentRows(): Row[] {
    if (!this.loaded) throw new Error('Runner: no input loaded; call loadInput first.');
    return this.derivedRows;
  }

  currentSpec(): Spec {
    if (!this.loaded) throw new Error('Runner: no input loaded; call loadInput first.');
    return this.spec;
  }

  async exportAs(path: string): Promise<void> {
    if (!this.loaded) throw new Error('Runner: no input loaded; call loadInput first.');
    if (!path.endsWith('.jsonl')) throw new Error(`exportAs: V1 only supports .jsonl, got ${path}`);
    await writeJsonl(path, this.derivedRows, this.spec.columns.map((c) => c.id));
  }

  async setSpec(spec: Spec): Promise<void> {
    const validated = validateSpec(spec);
    // Anchor spec.table to the loadInput'd source so downstream consumers
    // (e.g. /save-flow) can always recover the CSV path.
    if (this.sourcePath) validated.table = this.sourcePath;
    const rows = await this.replay(validated, this.sourceRows, undefined, undefined);
    this.spec = validated;
    this.derivedRows = rows;
    this.loaded = true;
  }

  async request(text: string, callOpts: { signal?: AbortSignal; onChunk?: (u: ChunkUpdate) => void; onPlan?: (items: PlanItem[]) => void } = {}): Promise<void> {
    if (!this.loaded) throw new Error('Runner: no input loaded; call loadInput first.');
    if (this.busy) throw new Error('Runner: a request is already in progress.');
    this.busy = true;
    const signal = callOpts.signal ?? this.opts.signal;
    const onChunk = callOpts.onChunk ?? this.opts.onChunk;
    const onPlan = callOpts.onPlan ?? this.opts.onPlan;
    const debugTurns: RequestDebugTurn[] = [];
    try {
      const budget = this.opts.recoveryBudget ?? 3;
      let lastError: string | undefined;
      let userPrompt = `Current spec:\n${JSON.stringify(this.spec, null, 2)}\n\nUser request: ${text}`;
      for (let turn = 0; turn < budget; turn++) {
        if (signal?.aborted) throw new Error('Runner: cancelled');
        const ops = await this.callLlm(userPrompt, signal);
        const turnLog: RequestDebugTurn = { ops, outcome: '' };
        debugTurns.push(turnLog);
        const attempt = (() => {
          try {
            if (ops.length === 0) {
              return { kind: 'err' as const, message: 'You called apply_spec_patch with an empty operations array. Emit at least one operation that fulfills the user request.' };
            }
            const patched = jsonpatch.applyPatch(structuredClone(this.spec), ops as jsonpatch.Operation[], false, false).newDocument as unknown;
            const validated = validateSpec(patched);
            if (JSON.stringify(validated) === JSON.stringify(this.spec)) {
              return { kind: 'err' as const, message: 'Your patch applied cleanly but left the spec identical to before. Emit operations that actually modify the spec to fulfill the user request.' };
            }
            return { kind: 'ok' as const, spec: validated };
          } catch (e) {
            return { kind: 'err' as const, message: (e as Error).message };
          }
        })();
        if (attempt.kind === 'err') {
          turnLog.outcome = 'rejected';
          turnLog.sentBack = attempt.message;
          lastError = attempt.message;
          userPrompt = `Your previous patch failed: ${attempt.message}\n\nCurrent spec:\n${JSON.stringify(this.spec, null, 2)}\n\nOriginal user request: ${text}\n\nEmit a corrected patch.`;
          continue;
        }
        if (onPlan) {
          const plan = computePlan(this.spec, attempt.spec);
          if (plan.length > 0) onPlan(plan);
        }
        try {
          const newRows = await this.replay(attempt.spec, this.sourceRows, signal, onChunk);
          if (signal?.aborted) throw new Error('Runner: cancelled');
          this.spec = attempt.spec;
          this.derivedRows = newRows;
          turnLog.outcome = 'committed';
          return;
        } catch (e) {
          if (signal?.aborted || (e as Error).message === 'Runner: cancelled') throw new Error('Runner: cancelled');
          turnLog.outcome = `evaluation failed: ${(e as Error).message}`;
          lastError = (e as Error).message;
          turnLog.sentBack = `evaluation error: ${lastError}`;
          userPrompt = `Your previous patch applied but evaluation failed: ${lastError}\n\nCurrent spec:\n${JSON.stringify(this.spec, null, 2)}\n\nOriginal user request: ${text}\n\nEmit a corrected patch.`;
        }
      }
      const err = new Error(`Runner: recovery budget exhausted${lastError ? `; last error: ${lastError}` : ''}`);
      (err as Error & { debug?: RequestDebugInfo }).debug = { userRequest: text, turns: debugTurns };
      throw err;
    } finally {
      this.busy = false;
    }
  }

  private async callLlm(userPrompt: string, signal?: AbortSignal): Promise<unknown[]> {
    let captured: unknown[] | undefined;
    const applySpecPatch = tool({
      description: 'Apply RFC 6902 JSON Patch operations to the current spec.',
      inputSchema: PATCH_INPUT_SCHEMA,
      execute: async ({ operations }: { operations: unknown[] }) => {
        captured = operations;
        return { ok: true };
      },
    });
    await rateLimiter.acquire(signal);
    const result = await generateText({
      model: this.model(),
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
      tools: { apply_spec_patch: applySpecPatch },
      toolChoice: { type: 'tool', toolName: 'apply_spec_patch' },
      stopWhen: stepCountIs(2),
      abortSignal: signal,
      temperature: 0,
      maxRetries: this.opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    });
    if (!captured) {
      const direct = result.toolCalls?.find((c) => c.toolName === 'apply_spec_patch');
      if (direct && (direct.input as { operations?: unknown[] })?.operations) {
        captured = (direct.input as { operations: unknown[] }).operations;
      }
    }
    if (!captured) throw new Error(`LLM did not call apply_spec_patch; returned text: ${result.text?.slice(0, 200) ?? '<empty>'}`);
    return captured;
  }

  private async replay(
    spec: Spec,
    sourceRows: Row[],
    signal: AbortSignal | undefined,
    onChunk: ((u: ChunkUpdate) => void) | undefined
  ): Promise<Row[]> {
    let startIndex = 0;
    let rows: Row[];
    const prevTransformations = this.spec.transformations;
    const prefixMatches =
      spec.transformations.length >= prevTransformations.length &&
      prevTransformations.every((p, i) => JSON.stringify(p) === JSON.stringify(spec.transformations[i]));
    if (prefixMatches && this.derivedRows.length > 0) {
      rows = this.derivedRows.map((r) => ({ ...r }));
      startIndex = prevTransformations.length;
    } else {
      rows = sourceRows.map((r) => ({ ...r }));
    }
    for (let tIndex = startIndex; tIndex < spec.transformations.length; tIndex++) {
      const t = spec.transformations[tIndex] as Transformation;
      if (signal?.aborted) throw new Error('Runner: cancelled');
      rows = await this.applyTransformation(rows, t, tIndex, signal, onChunk);
    }
    return rows;
  }

  private async applyTransformation(
    rows: Row[],
    t: Transformation,
    tIndex: number,
    signal: AbortSignal | undefined,
    onChunk: ((u: ChunkUpdate) => void) | undefined
  ): Promise<Row[]> {
    switch (t.kind) {
      case 'filter': {
        const fn = compileJsPredicate(t.pred, ['row', 'i', 'rows']);
        const out: Row[] = [];
        for (let i = 0; i < rows.length; i++) {
          if (fn(rows[i], i, rows)) out.push(rows[i]!);
        }
        return out;
      }
      case 'select': {
        return rows.map((row) => {
          const out: Row = {};
          for (const col of t.columns) out[col] = col in row ? row[col] : null;
          return out;
        });
      }
      case 'sort': {
        const keys: Array<(row: Row, i: number, rows: Row[]) => unknown> = t.by.map((b) =>
          typeof b.key === 'string'
            ? ((row: Row) => row[b.key as string])
            : (compileJsPredicate(b.key, ['row', 'i', 'rows']) as (row: Row, i: number, rows: Row[]) => unknown)
        );
        const dirs = t.by.map((b) => (b.dir === 'desc' ? -1 : 1));
        return rows
          .map((row, i) => ({ row, i }))
          .sort((a, b) => {
            for (let k = 0; k < keys.length; k++) {
              const av = keys[k]!(a.row, a.i, rows) as number | string;
              const bv = keys[k]!(b.row, b.i, rows) as number | string;
              if (av < bv) return -dirs[k]!;
              if (av > bv) return dirs[k]!;
            }
            return 0;
          })
          .map((x) => x.row);
      }
      case 'mutate': {
        const cols = Array.isArray(t.columns) ? t.columns : [t.columns];
        if ('js' in t.value) {
          const fn = compileJsPredicate(t.value, ['row', 'i', 'rows']);
          return rows.map((row, i) => {
            const result = fn(row, i, rows);
            const out: Row = { ...row };
            if (cols.length === 1) out[cols[0]!] = result;
            else if (result && typeof result === 'object')
              for (const c of cols) out[c] = (result as Row)[c];
            return out;
          });
        }
        // llm mutate
        const template = t.value.llm;
        const perCellModel = t.value.model;
        validateTemplate(template, rows);
        const batchSize = Math.max(1, this.opts.batchSize ?? DEFAULT_BATCH_SIZE);
        const chunkSize = Math.max(1, this.opts.chunkSize ?? DEFAULT_CHUNK_SIZE);
        const out: Row[] = rows.map((r) => ({ ...r }));
        const batches: Array<{ start: number; rows: Row[] }> = [];
        for (let i = 0; i < rows.length; i += batchSize) {
          batches.push({ start: i, rows: rows.slice(i, i + batchSize) });
        }
        for (let g = 0; g < batches.length; g += chunkSize) {
          if (signal?.aborted) throw new Error('Runner: cancelled');
          const group = batches.slice(g, g + chunkSize);
          const groupResults = await Promise.all(
            group.map((b) => this.evalLlmBatch(template, b.rows, perCellModel, signal))
          );
          if (signal?.aborted) throw new Error('Runner: cancelled');
          for (let gi = 0; gi < group.length; gi++) {
            const b = group[gi]!;
            const results = groupResults[gi]!;
            for (let j = 0; j < b.rows.length; j++) {
              const value = results[j];
              const rowIndex = b.start + j;
              for (const c of cols) {
                const before = out[rowIndex]![c];
                out[rowIndex]![c] = value;
                if (onChunk) onChunk({ transformationIndex: tIndex, rowIndex, column: c, before, after: value });
              }
            }
          }
          // yield to the event loop so a pending abort.abort() in the test harness
          // is observed before the next chunk starts.
          await new Promise((r) => setTimeout(r, 0));
        }
        return out;
      }
    }
  }

  private renderPrompt(template: string, row: Row): string {
    return template.replace(/\{([^{}]+)\}/g, (_, col) => {
      const v = row[col];
      return v === null || v === undefined ? '' : String(v);
    });
  }

  private cacheKey(perCellModel: string | undefined, prompt: string): string {
    const modelName = perCellModel ?? this.opts.cellModel ?? DEFAULT_CELL_MODEL;
    return `${modelName} ${prompt}`;
  }

  private async evalLlmBatch(
    template: string,
    rows: Row[],
    perCellModel: string | undefined,
    signal?: AbortSignal
  ): Promise<unknown[]> {
    if (rows.length === 0) return [];
    const prompts = rows.map((r) => this.renderPrompt(template, r));
    const results: unknown[] = new Array(rows.length);
    const pendingIdx: number[] = [];
    const pendingPrompts: string[] = [];
    for (let i = 0; i < prompts.length; i++) {
      const key = this.cacheKey(perCellModel, prompts[i]!);
      if (this.cellResultCache.has(key)) {
        results[i] = this.cellResultCache.get(key);
      } else {
        pendingIdx.push(i);
        pendingPrompts.push(prompts[i]!);
      }
    }
    if (pendingPrompts.length === 0) return results;
    const fetched = await this.callLlmBatch(pendingPrompts, perCellModel, signal);
    for (let k = 0; k < pendingIdx.length; k++) {
      const val = fetched[k];
      const idx = pendingIdx[k]!;
      results[idx] = val;
      this.cellResultCache.set(this.cacheKey(perCellModel, pendingPrompts[k]!), val);
    }
    return results;
  }

  private async callLlmBatch(
    prompts: string[],
    perCellModel: string | undefined,
    signal?: AbortSignal
  ): Promise<unknown[]> {
    if (prompts.length === 0) return [];
    if (prompts.length === 1) return [await this.callLlmOnce(prompts[0]!, perCellModel, signal)];
    const userMessage = prompts.map((p, i) => `[${i + 1}]\n${p}`).join('\n\n---\n\n');
    await rateLimiter.acquire(signal);
    const result = await generateText({
      model: this.cellModel(perCellModel),
      system: BATCH_SYSTEM_PROMPT,
      prompt: userMessage,
      abortSignal: signal,
      temperature: 0,
      maxRetries: this.opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
    const parsed = tryParseBatchResponse(result.text ?? '', prompts.length);
    if (parsed) return parsed;
    // Fallback: per-cell, in parallel.
    return Promise.all(prompts.map((p) => this.callLlmOnce(p, perCellModel, signal)));
  }

  private async callLlmOnce(
    prompt: string,
    perCellModel: string | undefined,
    signal?: AbortSignal
  ): Promise<unknown> {
    await rateLimiter.acquire(signal);
    const result = await generateText({
      model: this.cellModel(perCellModel),
      prompt,
      abortSignal: signal,
      temperature: 0,
      maxRetries: this.opts.maxRetries ?? DEFAULT_MAX_RETRIES,
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
    const text = (result.text ?? '').trim();
    if (text === '' || text.toLowerCase() === 'null') return null;
    return text;
  }
}

/** @internal — exported for unit tests. */
export function computePlan(oldSpec: Spec, newSpec: Spec): PlanItem[] {
  const items: PlanItem[] = [];
  const oldIds = oldSpec.columns.map((c) => c.id);
  const newIds = newSpec.columns.map((c) => c.id);
  const oldSet = new Set(oldIds);
  const newSet = new Set(newIds);
  for (const id of newIds) if (!oldSet.has(id)) items.push({ kind: 'add-column', id });
  for (const id of oldIds) if (!newSet.has(id)) items.push({ kind: 'remove-column', id });
  const sameSet = oldIds.length === newIds.length && oldIds.every((id) => newSet.has(id));
  if (sameSet && oldIds.some((id, i) => id !== newIds[i])) {
    items.push({ kind: 'reorder-columns', from: oldIds, to: newIds });
  }
  const oldT = oldSpec.transformations;
  const newT = newSpec.transformations;
  let prefix = 0;
  while (
    prefix < oldT.length &&
    prefix < newT.length &&
    JSON.stringify(oldT[prefix]) === JSON.stringify(newT[prefix])
  )
    prefix++;
  for (let i = prefix; i < oldT.length; i++)
    items.push({ kind: 'remove-transformation', transformation: oldT[i] as Transformation });
  for (let i = prefix; i < newT.length; i++)
    items.push({ kind: 'add-transformation', transformation: newT[i] as Transformation });
  return items;
}

/** @internal — exported for unit tests. */
export function tryParseBatchResponse(text: string, expectedLen: number): unknown[] | undefined {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== expectedLen) return undefined;
    return parsed.map((v) => {
      if (v === null) return null;
      if (typeof v === 'string') {
        const t = v.trim();
        return t === '' || t.toLowerCase() === 'null' ? null : t;
      }
      return String(v);
    });
  } catch {
    return undefined;
  }
}

function validateTemplate(template: string, rows: Row[]): void {
  const matches = [...template.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!);
  if (rows.length === 0) return;
  const sample = rows[0]!;
  for (const col of matches) {
    if (!(col in sample)) {
      throw new Error(`LLM template references column "${col}" which is not present in the data. Available columns: ${Object.keys(sample).join(', ')}.`);
    }
  }
}

function compileJsPredicate(expr: Expr, args: string[]): (...a: unknown[]) => unknown {
  if (!('js' in expr)) throw new Error('compileJsPredicate: expected {js} expression');
  const body = expr.js.trim();
  try {
    return new Function(...args, `return (${body});`) as (...a: unknown[]) => unknown;
  } catch (e) {
    throw new Error(`JS expression failed to compile: ${(e as Error).message} — body: ${body}`);
  }
}

export function createHeadlessRunner(opts: HeadlessRunnerOptions = {}): HeadlessRunner {
  return new HeadlessRunnerImpl(opts);
}
