import { describe, expect, it } from 'vitest';
import { applyUciMove, LEVEL_RANGE, START_FEN, type Score } from '@stratchess-ui/shared';
import {
  chooseMove,
  LEVELS,
  levelOf,
  rankMoves,
  scoreCp,
  surrenders,
  type Level,
  type RankedMove,
} from './opponent.ts';

/** Dice that roll the given values in order, failing a test that rolls more than it expects. */
function dice(...values: number[]): () => number {
  return () => {
    if (values.length === 0) throw new Error('rolled more dice than the test expects');
    return values.shift()!;
  };
}

const NO = 0.99;
const YES = 0;
const FIRST = 0;
const LAST = 0.99;

// Losses from the best: 0, 10, 30, 150, 950, 2050, and a mate given up, capped at 3000.
const RANKED: RankedMove[] = [
  { uci: 'best', scoreCp: 50 },
  { uci: 'close', scoreCp: 40 },
  { uci: 'slip', scoreCp: 20 },
  { uci: 'pawn', scoreCp: -100 },
  { uci: 'queen', scoreCp: -900 },
  { uci: 'rooks', scoreCp: -2000 },
  { uci: 'mated', scoreCp: -29_999 },
];

const shifted = (by: number) => RANKED.map((m) => ({ ...m, scoreCp: m.scoreCp + by }));

const level = (overrides: Partial<Level>): Level => ({ ...levelOf(2), ...overrides });

describe('levels', () => {
  it('has one level for each the protocol offers', () => {
    expect(LEVELS).toHaveLength(LEVEL_RANGE.max - LEVEL_RANGE.min + 1);
  });
});

describe('chooseMove', () => {
  it('plays a move within the variety of the best when not erring', () => {
    expect(chooseMove(RANKED, levelOf(2), dice(NO, NO, FIRST))).toBe('best');
    expect(chooseMove(RANKED, levelOf(2), dice(NO, NO, LAST))).toBe('close');
  });

  it('errs within the loss band, never the best move nor beyond the band', () => {
    expect(chooseMove(RANKED, levelOf(2), dice(NO, YES, FIRST))).toBe('pawn');
    expect(chooseMove(RANKED, levelOf(2), dice(NO, YES, LAST))).toBe('queen');
  });

  it('caps a loss at 3000, so a level allowing 3000 can give up a mate', () => {
    expect(chooseMove(RANKED, levelOf(1), dice(NO, YES, LAST))).toBe('mated');
  });

  it('falls back to the best moves when no move is in the band', () => {
    const close = RANKED.slice(0, 3);
    expect(chooseMove(close, levelOf(2), dice(NO, YES, FIRST))).toBe('best');
  });

  it('makes no deliberate mistake at or below the floor', () => {
    const behind = shifted(-150); // best -100, the floor
    expect(chooseMove(behind, levelOf(2), dice(NO, FIRST))).toBe('best');
    expect(chooseMove(shifted(-149), levelOf(2), dice(NO, YES, FIRST))).toBe('pawn');
  });

  it('moves at random once surrendering, and counts it', () => {
    const lost = shifted(-550); // best -500
    expect(surrenders(lost, levelOf(2))).toBe(true);
    expect(surrenders(shifted(-549), levelOf(2))).toBe(false);
    expect(surrenders(lost, levelOf(4))).toBe(false);
    expect(chooseMove(lost, levelOf(2), dice(LAST))).toBe('mated');
  });

  it('misses a mate-in-one threat at its chance, unless a mate is already on the board', () => {
    const blind = level({ mateBlindChance: 0.15 });
    expect(chooseMove(RANKED, blind, dice(0.14, FIRST))).toBe('mated');
    expect(chooseMove(RANKED, blind, dice(0.15, NO, FIRST))).toBe('best');
    const mating = [{ uci: 'mate', scoreCp: 29_999 }, ...RANKED];
    expect(chooseMove(mating, blind, dice(NO, FIRST))).toBe('mate');
  });

  it('plays the only legal move', () => {
    expect(chooseMove([{ uci: 'only', scoreCp: -40 }], levelOf(1), dice(NO, YES, LAST))).toBe(
      'only',
    );
  });
});

describe('scoreCp', () => {
  it('maps a mate in N to 30000 - N, from the side to move', () => {
    expect(scoreCp({ cp: -35 })).toBe(-35);
    expect(scoreCp({ mate: 3 })).toBe(29_997);
    expect(scoreCp({ mate: -1 })).toBe(-29_999);
    expect(scoreCp({ mate: 0 })).toBe(-30_000);
  });
});

describe('rankMoves', () => {
  /** A search answering from a table of child moves, recording which it was asked for. */
  function scripted(scores: Record<string, Score>, fallback: Score = { cp: 0 }) {
    const asked: string[] = [];
    const search = async (uci: string) => {
      asked.push(uci);
      return scores[uci] ?? fallback;
    };
    return { asked, search };
  }

  it('negates each child score, best first for the mover', async () => {
    const { search } = scripted({ e2e4: { cp: -40 }, g1f3: { cp: 25 }, f2f3: { mate: 1 } });
    const ranked = (await rankMoves([START_FEN], search, () => false))!;
    expect(ranked).toHaveLength(20);
    expect(ranked[0]).toEqual({ uci: 'e2e4', scoreCp: 40 });
    expect(ranked.at(-2)).toEqual({ uci: 'g1f3', scoreCp: -25 });
    expect(ranked.at(-1)).toEqual({ uci: 'f2f3', scoreCp: -29_999 });
  });

  it('scores a mate or a stalemate from the rules, never searching it', async () => {
    // White mates with Qg7, protected by the king, and stalemates with Qg6.
    const fen = '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1';
    const { asked, search } = scripted({}, { cp: -500 });
    const ranked = (await rankMoves([fen], search, () => false))!;
    expect(ranked[0]).toEqual({ uci: 'g1g7', scoreCp: 30_000 });
    expect(ranked.find((m) => m.uci === 'g1g6')).toEqual({ uci: 'g1g6', scoreCp: 0 });
    expect(asked).not.toContain('g1g7');
    expect(asked).not.toContain('g1g6');
    expect(asked).toHaveLength(ranked.length - 2);
  });

  it('scores a threefold repetition by the game history as a draw, never searching it', async () => {
    const positions = [START_FEN];
    for (const move of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1']) {
      positions.push((applyUciMove(positions.at(-1)!, move) as { fen: string }).fen);
    }
    const { asked, search } = scripted({}, { cp: -50 });
    const ranked = (await rankMoves(positions, search, () => false))!;
    expect(ranked.at(-1)).toEqual({ uci: 'f6g8', scoreCp: 0 });
    expect(asked).not.toContain('f6g8');
  });

  it('stops before the next child search once the turn is gone', async () => {
    const { asked, search } = scripted({});
    expect(await rankMoves([START_FEN], search, () => asked.length >= 2)).toBeUndefined();
    expect(asked).toHaveLength(2);
  });
});
