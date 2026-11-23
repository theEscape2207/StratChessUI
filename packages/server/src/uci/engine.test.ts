import { afterEach, describe, expect, it, vi } from 'vitest';
import { START_FEN } from '@stratchess-ui/shared';
import { LIMITS, parseProfiles, ProfileError } from '../engines/profiles.ts';
import {
  EngineError,
  PositionRejectedError,
  SearchCancelledError,
  UciEngine,
  type Timeouts,
} from './engine.ts';
import { fakeProfile as profile } from './fake-profile.ts';
import { UciCommandError } from './protocol.ts';

const FAST: Partial<Timeouts> = { handshakeMs: 2000, readyMs: 1000, stopGraceMs: 300 };

let engine: UciEngine | undefined;
afterEach(async () => {
  await engine?.quit();
  engine = undefined;
  vi.restoreAllMocks();
});

async function startFromRawOptions(options: unknown, args: string[] = []): Promise<UciEngine> {
  const [parsed] = parseProfiles(
    { engines: [{ ...profile('normal', {}, args), options }] },
    process.cwd(),
  );
  engine = await UciEngine.start(parsed!, FAST);
  return engine;
}

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

  describe('raw profile resource options', () => {
    for (const [threads, hash] of [
      ['Threads', 'Hash'],
      ['threads', 'hash'],
      ['tHrEaDs', 'HASH'],
    ] as const) {
      it.each([
        [16, 1200],
        ['16', '1200'],
        [64, 4096],
        ['6.4e1', '0x1000'],
      ])(`caps ${threads}=%s and ${hash}=%s before setoption`, async (t, h) => {
        const running = await startFromRawOptions({ [threads]: t, [hash]: h });
        expect(running.transcript().filter((line) => line.startsWith('> setoption'))).toEqual([
          `> setoption name ${threads} value ${LIMITS.maxThreads}`,
          `> setoption name ${hash} value ${LIMITS.maxHashMiB}`,
        ]);
        expect(running.transcript()).toContain('< readyok');
      });
    }

    it.each([
      [2, 64],
      ['2', '64'],
      [' 2 ', '0x40'],
      [LIMITS.maxThreads, LIMITS.maxHashMiB],
    ])('preserves valid resources %s/%s and unrelated options through startup', async (t, h) => {
      const running = await startFromRawOptions({
        Threads: t,
        Hash: h,
        Contempt: '10',
        SingularExtensions: false,
      });
      expect(running.transcript().filter((line) => line.startsWith('> setoption'))).toEqual([
        `> setoption name Threads value ${Number(t)}`,
        `> setoption name Hash value ${Number(h)}`,
        '> setoption name Contempt value 10',
        '> setoption name SingularExtensions value false',
      ]);
    });

    it.each([
      { Threads: 1, threads: 16 },
      { threads: '16', Threads: 1 },
      { Hash: 16, HASH: '1200' },
      { HASH: '1200', hash: 16 },
      { Threads: 2, THREADS: 2 },
      { Hash: 64, hash: 64 },
    ])('rejects duplicate resources before startup: %j', async (options) => {
      const start = vi.spyOn(UciEngine, 'start');
      const [first, second] = Object.keys(options);
      await expect(startFromRawOptions(options)).rejects.toThrow(
        new ProfileError(`engines[0].options.${second}: duplicates resource option ${first}`),
      );
      expect(start).not.toHaveBeenCalled();
    });

    it('retains announced-range validation after parsing a resource value', async () => {
      await expect(startFromRawOptions({ Hash: '1200' }, ['--hash-max=512'])).rejects.toThrow(
        'option Hash=1024 outside 1..512',
      );
    });
  });

  it('refuses an option the engine does not announce, or one out of range', async () => {
    await expect(UciEngine.start(profile('normal', { UCI_Chess960: true }), FAST)).rejects.toThrow(
      'does not announce option UCI_Chess960',
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
    expect(result).toMatchObject({ bestMove: 'b1c3', info: { depth: 3, score: { cp: 29 } } });
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

  it('stops a depth search at a cap of its own, well inside the host cap, and says so', async () => {
    // The host cap is a minute; the fake searches any position after 1.e4 until it is stopped.
    engine = await UciEngine.start(profile('normal', {}, ['--hold=e2e4']), FAST);
    const capped = { fen: START_FEN, limit: { depth: 3 }, capMs: 100 };
    expect(await engine.search({ ...capped, moves: ['e2e4'] })).toMatchObject({
      bestMove: 'g8f6',
      capped: true,
    });
    expect((await engine.search(capped)).capped).toBe(false);
  });

  it('clears the hash with ucinewgame, once the search asked for before it is done', async () => {
    engine = await UciEngine.start(profile(), FAST);
    const searched = engine.search({ fen: START_FEN, limit: { depth: 3 } });
    await engine.clearHash();
    expect((await searched).bestMove).toBe('b1c3');
    const lines = engine.transcript();
    expect(lines.slice(-4)).toEqual(['< bestmove b1c3', '> ucinewgame', '> isready', '< readyok']);
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

  it('refuses more ranked lines than the engine announces, sending nothing', async () => {
    engine = await UciEngine.start(profile('normal', {}, ['--no-multipv']), FAST);
    const limit = { depth: 1 };
    await expect(engine.search({ fen: START_FEN, limit, multiPv: 2 })).rejects.toThrow(
      'MultiPV 2 outside 1..1',
    );
    await engine.search({ fen: START_FEN, limit });
    expect(engine.transcript().filter((line) => line.includes('MultiPV'))).toEqual([]);
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
