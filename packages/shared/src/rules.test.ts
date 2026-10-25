import { describe, expect, it } from 'vitest';
import { applyUciMove, legalDests, outcome, START_FEN, turn } from './rules.ts';

describe('rules', () => {
  it('lists the twenty opening moves', () => {
    const dests = legalDests(START_FEN);
    const count = [...dests.values()].reduce((n, d) => n + d.length, 0);
    expect(count).toBe(20);
    expect(dests.get('e2')).toEqual(expect.arrayContaining(['e3', 'e4']));
  });

  it('applies a legal move and passes the turn', () => {
    const result = applyUciMove(START_FEN, 'e2e4');
    expect(result).toEqual({
      ok: true,
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    });
    if (result.ok) expect(turn(result.fen)).toBe('black');
  });

  it('rejects an illegal move with a reason', () => {
    expect(applyUciMove(START_FEN, 'e2e5')).toEqual({ ok: false, reason: 'illegal move: e2e5' });
  });

  it('rejects an invalid FEN instead of falling back to the start position', () => {
    const result = applyUciMove('not a fen', 'e2e4');
    expect(result.ok).toBe(false);
    expect(legalDests('not a fen').size).toBe(0);
  });

  it('reports checkmate and stalemate', () => {
    expect(outcome('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toBe('black');
    expect(outcome('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toBe('draw');
    expect(outcome(START_FEN)).toBeUndefined();
  });
});
