import { describe, it, expect, beforeAll } from 'bun:test';
import { Writable } from 'node:stream';
import { readFile, unlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCliRunner, handleSlashCommand } from './index.ts';
import { loadEnv, readJsonl, validateSpec } from '@tabletamer/core';

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

beforeAll(() => {
  loadEnv();
});

describe('handleSlashCommand', () => {
  it('returns "exit" for the exit alias', async () => {
    const { stream } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    expect(await handleSlashCommand('exit', runner, stream)).toBe('exit');
    expect(await handleSlashCommand('/exit', runner, stream)).toBe('exit');
  });

  it('returns "handled" for /help and writes a usage screen', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    expect(await handleSlashCommand('/help', runner, stream)).toBe('handled');
    const out = text();
    expect(out).toContain('Usage:');
    expect(out).toContain('/help');
    expect(out).toContain('/undo');
    expect(out).toContain('exit');
  });

  it('returns "unhandled" for free-form text (passes through to the LLM path)', async () => {
    const { stream } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    expect(await handleSlashCommand('normalize phone numbers', runner, stream)).toBe('unhandled');
    expect(await handleSlashCommand('helpme', runner, stream)).toBe('unhandled');
    expect(await handleSlashCommand('undo this thing', runner, stream)).toBe('unhandled');
  });

  it('on /undo with no transformations writes "nothing to undo."', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    expect(await handleSlashCommand('/undo', runner, stream)).toBe('handled');
    expect(text()).toContain('nothing to undo.');
    expect(runner.currentSpec().transformations.length).toBe(0);
  });

  it('on /save without a path prints usage', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    expect(await handleSlashCommand('/save', runner, stream)).toBe('handled');
    expect(text()).toContain('/save: missing path');
  });

  it('on /save <path> writes current rows as JSONL', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    const out = join(tmpdir(), `tabletamer-slash-${process.pid}-${Date.now()}.jsonl`);
    try {
      expect(await handleSlashCommand(`/save ${out}`, runner, stream)).toBe('handled');
      expect(text()).toContain(`saved ${runner.currentRows().length} rows to ${out}`);
      await stat(out);
      const written = await readJsonl(out);
      expect(written.length).toBe(runner.currentRows().length);
    } finally {
      await unlink(out).catch(() => {});
    }
  });

  it('on /save with a non-jsonl path surfaces the error', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    const out = join(tmpdir(), `tabletamer-slash-${process.pid}-${Date.now()}.csv`);
    expect(await handleSlashCommand(`/save ${out}`, runner, stream)).toBe('handled');
    expect(text()).toContain('error:');
    await unlink(out).catch(() => {});
  });

  it('on /save-flow without a path prints usage', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    expect(await handleSlashCommand('/save-flow', runner, stream)).toBe('handled');
    expect(text()).toContain('/save-flow: missing path');
  });

  it('on /save-flow writes a flow whose source is relative to the flow file dir', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    // Seed a JS-only transformation so we can verify the spec round-trips.
    const flowFixture = JSON.parse(await readFile('test-cases/dedupe.flow', 'utf8'));
    await runner.setSpec(validateSpec(flowFixture.spec));
    const outFlow = join(tmpdir(), `tabletamer-saveflow-${process.pid}-${Date.now()}.flow`);
    try {
      expect(await handleSlashCommand(`/save-flow ${outFlow}`, runner, stream)).toBe('handled');
      expect(text()).toContain('saved flow');
      const saved = JSON.parse(await readFile(outFlow, 'utf8'));
      expect(saved.version).toBe(1);
      expect(typeof saved.source).toBe('string');
      // The source should resolve back to the original CSV when joined to flowDir.
      const resolved = join(tmpdir(), saved.source);
      expect(resolved.endsWith('test-cases/dedupe-input.csv')).toBe(true);
      expect(saved.spec.transformations.length).toBe(runner.currentSpec().transformations.length);
    } finally {
      await unlink(outFlow).catch(() => {});
    }
  });

  it('on /save-flow followed by execute round-trips the same rows', async () => {
    const { stream } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    const flowFixture = JSON.parse(await readFile('test-cases/dedupe.flow', 'utf8'));
    await runner.setSpec(validateSpec(flowFixture.spec));
    const expectedRows = runner.currentRows();
    // Save inside test-cases/ so the relative source resolves to dedupe-input.csv.
    const outFlow = `test-cases/repl-save-flow-roundtrip-${process.pid}.flow`;
    const outJsonl = `test-cases/repl-save-flow-roundtrip-${process.pid}.jsonl`;
    try {
      await handleSlashCommand(`/save-flow ${outFlow}`, runner, stream);
      const { runCli } = await import('./index.ts');
      const result = await runCli(['execute', outFlow, '--output', outJsonl.split('/').pop()!]);
      expect(result.exitCode).toBe(0);
      const replayed = await readJsonl(outJsonl);
      expect(replayed.length).toBe(expectedRows.length);
      for (let i = 0; i < expectedRows.length; i++) {
        expect(replayed[i]).toEqual(expectedRows[i] as Record<string, unknown>);
      }
    } finally {
      await unlink(outFlow).catch(() => {});
      await unlink(outJsonl).catch(() => {});
    }
  });

  it('on /undo after a JS-only setSpec pops the last transformation and reprints', async () => {
    const { stream, text } = captureStdout();
    const runner = createCliRunner({ stdout: stream, quiet: true });
    await runner.loadInput('test-cases/dedupe-input.csv');
    const flow = JSON.parse(await readFile('test-cases/dedupe.flow', 'utf8'));
    const spec = validateSpec(flow.spec);
    await runner.setSpec(spec);
    const beforeLen = runner.currentSpec().transformations.length;
    expect(beforeLen).toBeGreaterThan(0);
    expect(await handleSlashCommand('/undo', runner, stream)).toBe('handled');
    const out = text();
    expect(out).toContain('undid:');
    expect(out).toContain('filter rows where');
    expect(runner.currentSpec().transformations.length).toBe(beforeLen - 1);
  });
});
