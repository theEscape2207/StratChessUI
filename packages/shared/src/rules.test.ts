import { describe, expect, it } from 'vitest';
import {
  applyUciMove,
  legalDests,
  outcome,
  parseStartFen,
  sanMoves,
  START_FEN,
  turn,
} from './rules.ts';

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
      uci: 'e2e4',
    });
    if (result.ok) expect(turn(result.fen)).toBe('black');
  });

  it('returns castling in standard UCI, king two squares, whichever form it was given', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    for (const [given, standard] of [
      ['e1h1', 'e1g1'],
      ['e1g1', 'e1g1'],
      ['e1a1', 'e1c1'],
      ['e1c1', 'e1c1'],
    ]) {
      expect(applyUciMove(fen, given!)).toMatchObject({ ok: true, uci: standard });
    }
    expect(applyUciMove(fen.replace(' w ', ' b '), 'e8h8')).toMatchObject({ uci: 'e8g8' });
  });

  it('rejects an illegal move with a reason', () => {
    expect(applyUciMove(START_FEN, 'e2e5')).toEqual({ ok: false, reason: 'illegal move: e2e5' });
  });

  it('rejects an invalid FEN instead of falling back to the start position', () => {
    const result = applyUciMove('not a fen', 'e2e4');
    expect(result.ok).toBe(false);
    expect(legalDests('not a fen').size).toBe(0);
  });

  it('captures en passant, removing the passed pawn', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    expect(applyUciMove(fen, 'e5d6')).toEqual({
      ok: true,
      fen: 'rnbqkbnr/ppp1pppp/3P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
      uci: 'e5d6',
    });
  });

  it('promotes to the piece named, and refuses a promotion without one', () => {
    const fen = 'r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1';
    expect(applyUciMove(fen, 'b7a8n')).toMatchObject({ ok: true, fen: /^N3k3\//, uci: 'b7a8n' });
    expect(applyUciMove(fen, 'b7a8')).toEqual({ ok: false, reason: 'illegal move: b7a8' });
  });

  describe('parseStartFen', () => {
    it('accepts a FEN, filling in missing fields and dropping an unusable en passant square', () => {
      expect(parseStartFen(START_FEN)).toEqual({ ok: true, fen: START_FEN });
      expect(parseStartFen(' 4k3/8/8/8/4P3/8/8/4K3 b KQ e3 7 40 ')).toEqual({
        ok: true,
        fen: '4k3/8/8/8/4P3/8/8/4K3 b - - 7 40',
      });
      expect(parseStartFen('4k3/8/8/8/8/8/8/4K2R b')).toEqual({
        ok: true,
        fen: '4k3/8/8/8/8/8/8/4K2R b - - 0 1',
      });
    });

    it('rejects a malformed FEN or an illegal position with a reason', () => {
      for (const [fen, reason] of [
        ['', 'invalid FEN: empty'],
        [
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1',
          'invalid FEN: the board part is malformed',
        ],
        [START_FEN.replace(' w ', ' x '), 'invalid FEN: the side to move must be w or b'],
        [`${START_FEN} 9`, 'invalid FEN: not a FEN'],
        ['8/8/8/8/8/8/8/8 w - - 0 1', 'illegal position: the board is empty'],
        ['4k3/8/8/8/8/8/8/3KK3 w - - 0 1', 'illegal position: each side needs exactly one king'],
        ['4k3/8/8/8/8/8/8/4RK2 w - - 0 1', 'illegal position: the side not to move is in check'],
        ['P3k3/8/8/8/8/8/8/4K3 w - - 0 1', 'illegal position: a pawn is on the first or last rank'],
      ]) {
        expect(parseStartFen(fen!)).toEqual({ ok: false, reason });
      }
    });
  });

  it('gives SAN from the position a game started in', () => {
    expect(sanMoves('4k3/8/8/8/4P3/8/8/4K3 b - - 0 40', ['e8d7', 'e4e5'])).toEqual(['Kd7', 'e5']);
    expect(sanMoves('not a fen', ['e2e4'])).toEqual([]);
  });

  describe('outcome', () => {
    /** The positions of a game from `fen` through `moves`. */
    const positions = (fen: string, moves: string[]) =>
      moves.reduce(
        (seen, move) => {
          const result = applyUciMove(seen.at(-1)!, move);
          if (!result.ok) throw new Error(result.reason);
          return [...seen, result.fen];
        },
        [fen],
      );

    it('decides checkmate for the side that gave it', () => {
      const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      expect(outcome([mated])).toEqual({ result: 'black', termination: 'checkmate' });
    });

    it('draws stalemate and insufficient material', () => {
      expect(outcome(['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'])).toEqual({
        result: 'draw',
        termination: 'stalemate',
      });
      expect(outcome(['8/8/8/4k3/8/8/4K1N1/8 w - - 0 1'])).toEqual({
        result: 'draw',
        termination: 'insufficient material',
      });
    });

    it('draws on the hundredth half-move without a capture or pawn move, unless it mates', () => {
      expect(outcome(['8/8/8/4k3/8/8/4K3/R7 w - - 99 80'])).toBeUndefined();
      expect(outcome(['8/8/8/4k3/8/8/4K3/R7 w - - 100 80'])).toEqual({
        result: 'draw',
        termination: 'fifty-move rule',
      });
      expect(outcome(['R5k1/5ppp/8/8/8/8/8/6K1 b - - 100 80'])).toMatchObject({
        result: 'white',
        termination: 'checkmate',
      });
    });

    it('draws the third time a position occurs, an unusable en passant square aside', () => {
      // After e4 no black pawn can take en passant, so the FEN carries no e3 square.
      const shuffle = ['g8f6', 'g1f3', 'f6g8', 'f3g1'];
      const game = positions(START_FEN, ['e2e4', ...shuffle, ...shuffle]);
      expect(outcome(game.slice(0, -1))).toBeUndefined();
      expect(outcome(game)).toEqual({ result: 'draw', termination: 'threefold repetition' });
    });

    it('goes on while nothing decides the game', () => {
      expect(outcome([START_FEN])).toBeUndefined();
      expect(outcome([])).toBeUndefined();
    });
  });
});
