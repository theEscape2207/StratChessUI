import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { START_FEN } from '@stratchess-ui/shared';
import type { EngineProfile } from '../engines/profiles.ts';
import {
  EngineError,
  PositionRejectedError,
  SearchCancelledError,
  UciEngine,
  type Timeouts,
} from './engine.ts';
import { UciCommandError } from './protocol.ts';

const FAKE = fileURLToPath(new URL('./fake-engine.ts', import.meta.url));
const FAST: Partial<Timeouts> = { handshakeMs: 2000, readyMs: 1000, stopGraceMs: 300 };

function profile(mode = 'normal', options: EngineProfile['options'] = {}): EngineProfile {
  return {
    id: 'fake',
    name: 'Fake',
    executable: process.execPath,
    args: [FAKE, `--mode=${mode}`],
    options,
  };
}

let engine: UciEngine | undefined;
afterEach(async () => {
  await engine?.quit();
  engine = undefined;
});

describe('UciEngine', () => {
  it('completes the handshake and reads the announced options', async () => {
    engine = await UciEngine.start(profile('normal', { Threads: 2, Hash: 64 }), FAST);
    expect(engine.name).toBe('StratChess');
    expect(engine.options.find((o) => o.name === 'Hash')).toMatchObject({
      type: 'spin',
      min: 1,
      max: 1536,
    });
    expect(engine.transcript()).toContain('> setoption name Threads value 2');
  });

  it('refuses an option the engine does not announce, or one out of range', async () => {
    await expect(UciEngine.start(profile('normal', { MultiPV: 3 }), FAST)).rejects.toThrow(
      'does not announce option MultiPV',
    );
    await expect(UciEngine.start(profile('normal', { Contempt: 500 }), FAST)).rejects.toThrow(
      'outside 0..100',
    );
  });

  it('searches and reports info lines and the best move', async () => {
    engine = await UciEngine.start(profile(), FAST);
    const depths: number[] = [];
    const result = await engine.search({ fen: START_FEN, limit: { depth: 3 } }, (i) =>
      depths.push(i.depth!),
    );
    expect(result).toMatchObject({ bestMove: 'b1c3', info: { depth: 3, score: { cp: 25 } } });
    expect(depths).toEqual([1, 2, 3, 3]);
    expect(engine.transcript()).toContain(`> position fen ${START_FEN}`);
    expect(engine.transcript()).toContain('> go depth 3');
  });

  it('stops a running search before the next one and drops its bestmove', async () => {
    engine = await UciEngine.start(profile(), FAST);
    let searching!: () => void;
    const started = new Promise<void>((resolve) => (searching = resolve));
    const first = engine.search({ fen: START_FEN, limit: { movetimeMs: 10_000 } }, () =>
      searching(),
    );
    await started;
    const second = engine.search({ fen: START_FEN, moves: ['e2e4'], limit: { depth: 3 } });
    await expect(first).rejects.toBeInstanceOf(SearchCancelledError);
    // The fake answers g8f6 only for the position with moves, so this is the second search's move.
    expect(await second).toMatchObject({ bestMove: 'g8f6', generation: 2 });
    const sent = engine.transcript().filter((l) => l.startsWith('>'));
    expect(sent.indexOf('> stop')).toBeLessThan(sent.indexOf('> go depth 3'));
    expect(engine.transcript().some((l) => l.includes('ignored, a search is in progress'))).toBe(
      false,
    );
  });

  it('drops a search superseded before it started', async () => {
    engine = await UciEngine.start(profile(), FAST);
    const a = engine.search({ fen: START_FEN, limit: { movetimeMs: 10_000 } });
    const b = engine.search({ fen: START_FEN, limit: { movetimeMs: 10_000 } });
    const c = engine.search({ fen: START_FEN, limit: { depth: 3 } });
    await expect(a).rejects.toBeInstanceOf(SearchCancelledError);
    await expect(b).rejects.toBeInstanceOf(SearchCancelledError);
    expect((await c).generation).toBe(3);
    // Requested in the same tick, so only the newest search ever reaches the engine.
    expect(engine.transcript().filter((l) => l.startsWith('> go'))).toEqual(['> go depth 3']);
  });

  it('stop() cancels the search and leaves the engine usable', async () => {
    engine = await UciEngine.start(profile(), FAST);
    let searching!: () => void;
    const started = new Promise<void>((resolve) => (searching = resolve));
    const running = engine.search({ fen: START_FEN, limit: { movetimeMs: 10_000 } }, () =>
      searching(),
    );
    await started;
    await engine.stop();
    await expect(running).rejects.toBeInstanceOf(SearchCancelledError);
    expect((await engine.search({ fen: START_FEN, limit: { depth: 1 } })).bestMove).toBe('b1c3');
  });

  it('treats a rejected FEN or move list as an error, not a search of the start position', async () => {
    engine = await UciEngine.start(profile(), FAST);
    await expect(engine.search({ fen: '8/8/8/8 w', limit: { depth: 1 } })).rejects.toBeInstanceOf(
      PositionRejectedError,
    );
    await expect(
      engine.search({ fen: START_FEN, moves: ['e2e4', 'a1a1'], limit: { depth: 1 } }),
    ).rejects.toThrow("illegal move 'a1a1'");
    expect(engine.transcript().some((l) => l.startsWith('> go'))).toBe(false);
  });

  it('refuses line breaks and malformed moves before anything reaches the engine', async () => {
    engine = await UciEngine.start(profile(), FAST);
    await expect(
      engine.search({ fen: `${START_FEN}\nquit`, limit: { depth: 1 } }),
    ).rejects.toBeInstanceOf(UciCommandError);
    await expect(
      engine.search({ fen: START_FEN, moves: ['e2e4 quit'], limit: { depth: 1 } }),
    ).rejects.toBeInstanceOf(UciCommandError);
    expect(engine.alive).toBe(true);
  });

  it('refuses limits above the host caps', async () => {
    engine = await UciEngine.start(profile(), FAST);
    await expect(engine.search({ fen: START_FEN, limit: { depth: 99 } })).rejects.toThrow(
      'depth 99 exceeds',
    );
    await expect(
      engine.search({ fen: START_FEN, limit: { movetimeMs: 10 * 60_000 } }),
    ).rejects.toBeInstanceOf(UciCommandError);
  });

  it('reports no move for a finished game and keeps the engine', async () => {
    const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'; // the fake answers bestmove 0000 here
    engine = await UciEngine.start(profile(), FAST);
    await expect(engine.search({ fen: STALEMATE, limit: { depth: 1 } })).rejects.toThrow(
      'engine returned no move: bestmove 0000',
    );
    expect(engine.alive).toBe(true);
  });

  it('reports an engine crash with its transcript', async () => {
    engine = await UciEngine.start(profile('crash-on-go'), FAST);
    const error = await engine
      .search({ fen: START_FEN, limit: { depth: 1 } })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).message).toMatch(/exited \(code 3\)/);
    expect((error as EngineError).transcript).toContain('> go depth 1');
    expect(engine.alive).toBe(false);
  });

  it('times out a handshake that never finishes', async () => {
    await expect(
      UciEngine.start(profile('no-uciok'), { ...FAST, handshakeMs: 300 }),
    ).rejects.toThrow('waiting for uciok');
  });

  it('kills an engine that ignores stop', async () => {
    engine = await UciEngine.start(profile('ignore-stop'), { ...FAST, maxSearchMs: 200 });
    await expect(engine.search({ fen: START_FEN, limit: { depth: 30 } })).rejects.toThrow(
      'waiting for bestmove',
    );
    await expect.poll(() => engine!.alive).toBe(false);
  });

  it('reports a missing executable', async () => {
    const missing = { ...profile(), executable: 'C:/no/such/engine.exe', args: [] };
    await expect(UciEngine.start(missing, FAST)).rejects.toThrow(/cannot start|exited/);
  });
});
