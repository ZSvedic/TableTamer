import { describe, it, expect, beforeAll } from 'bun:test';
import { Writable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createCliRunner, handleSlashCommand } from './index.ts';
import { loadEnv, validateSpec } from '@tabletamer/core';

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
