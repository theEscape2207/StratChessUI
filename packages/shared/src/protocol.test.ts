import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol.ts';

const newGame = (limit: unknown, humanColor: unknown = 'black') =>
  parseClientMessage(JSON.stringify({ type: 'new-game', humanColor, engineId: 'x', limit }));

describe('protocol', () => {
  it('accepts a new game with a depth or move-time limit inside the ranges', () => {
    expect(newGame({ depth: 12 })).toEqual({
      type: 'new-game',
      humanColor: 'black',
      engineId: 'x',
      limit: { depth: 12 },
    });
    expect(newGame({ movetimeMs: 100 })).toMatchObject({ limit: { movetimeMs: 100 } });
  });

  it('refuses limits outside the ranges, and unknown sides', () => {
    for (const limit of [{ depth: 0 }, { depth: 41 }, { depth: 2.5 }, { movetimeMs: 60_001 }, {}]) {
      expect(newGame(limit)).toBeUndefined();
    }
    expect(newGame({ depth: 5 }, 'red')).toBeUndefined();
  });
});
