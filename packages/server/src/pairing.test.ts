import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileStore, memoryStore, Pairings } from './pairing.ts';

/** Pairings whose announced codes are collected, latest last. */
function open() {
  const codes: string[] = [];
  const pairings = new Pairings({
    store: memoryStore(),
    announce: (text) => {
      const code = /^pairing code: (\d{6})$/.exec(text)?.[1];
      if (code) codes.push(code);
    },
  });
  return { pairings, codes };
}

describe('Pairings', () => {
  it('rotates the code once it has paired a browser', () => {
    const { pairings, codes } = open();
    const token = pairings.pair(codes[0]!, 'phone')!;
    expect(pairings.isPaired(token)).toBe(true);
    expect(codes).toHaveLength(2);
    expect(pairings.pair(codes[0]!, 'tablet')).toBeUndefined();
  });

  it('rotates the code after five wrong attempts', () => {
    const { pairings, codes } = open();
    const wrong = codes[0] === '000000' ? '000001' : '000000';
    for (let i = 0; i < 4; i++) pairings.pair(wrong, 'guess');
    expect(codes).toHaveLength(1);
    pairings.pair(wrong, 'guess');
    expect(codes).toHaveLength(2);
    expect(pairings.pair(codes[1]!, 'phone')).toBeDefined();
  });
});

describe('fileStore', () => {
  it('creates the host directory on the first pairing', () => {
    const root = mkdtempSync(join(tmpdir(), 'stratchess-ui-'));
    try {
      const file = join(root, 'host', 'pairings.json');
      const store = fileStore(file);
      const pairings = new Pairings({ store, announce: () => {}, fixedCode: '123456' });
      const token = pairings.pair('123456', 'phone')!;
      expect(new Pairings({ store: fileStore(file), announce: () => {} }).isPaired(token)).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
