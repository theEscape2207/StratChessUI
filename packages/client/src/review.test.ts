import { describe, expect, it } from 'vitest';
import { START_FEN, type GameState } from '@stratchess-ui/shared';
import {
  bestMoveInstead,
  boardAt,
  gamePositions,
  moveScores,
  reviewEval,
  verdictTally,
} from './review.ts';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

describe('gamePositions', () => {
  it('lists the start position and the one after each move', () => {
    expect(gamePositions(START_FEN, ['e2e4', 'e7e5'])).toEqual([START_FEN, AFTER_E4, AFTER_E4_E5]);
    expect(gamePositions(START_FEN, [])).toEqual([START_FEN]);
  });

  it('stops at a move that does not apply', () => {
    expect(gamePositions(START_FEN, ['e2e4', 'e2e4', 'e7e5'])).toEqual([START_FEN, AFTER_E4]);
  });
});

describe('boardAt', () => {
  const game = { fen: AFTER_E4_E5, moves: ['e2e4', 'e7e5'], lastMove: 'e7e5' };
  const positions = [START_FEN, AFTER_E4, AFTER_E4_E5];

  it('shows each step with the move that led to it, and the start with none', () => {
    expect(boardAt(game, positions, 0)).toEqual({ fen: START_FEN });
    expect(boardAt(game, positions, 1)).toEqual({ fen: AFTER_E4, lastMove: 'e2e4' });
  });

  it("shows the last step, and the server's position where the replay fell short", () => {
    expect(boardAt(game, positions, 2)).toEqual({ fen: AFTER_E4_E5, lastMove: 'e7e5' });
    expect(boardAt(game, [START_FEN], 1)).toEqual({ fen: AFTER_E4_E5, lastMove: 'e7e5' });
  });
});

type Fixture = Pick<GameState, 'startFen' | 'moves' | 'verdicts' | 'feedback'>;

// 1. e4 e5 2. Nf3 Nc6, the human playing white: e4 was best, Nf3 an inaccuracy where d4 was best.
const judged: Fixture = {
  startFen: START_FEN,
  moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  verdicts: ['best', null, 'inaccuracy', null],
  feedback: [
    { score: { cp: 30 } },
    null,
    { score: { cp: 20 }, best: { score: { cp: 55 }, pv: ['d4', 'exd4'] } },
    null,
  ],
};
const unjudged: Fixture = { ...judged, verdicts: undefined, feedback: undefined };

// From the position after 1. e4, black to move first, the human playing black: 1... e5 2. Nf3 Nc6.
const blackFirst: Fixture = {
  startFen: AFTER_E4,
  moves: ['e7e5', 'g1f3', 'b8c6'],
  verdicts: ['mistake', null, 'great'],
  feedback: [{ score: { cp: 90 }, best: { score: { cp: 20 }, pv: ['c5'] } }, null, null],
};

describe('moveScores', () => {
  it("gives the human's moves their score and the engine's none", () => {
    expect(moveScores(judged)).toEqual([{ cp: 30 }, undefined, { cp: 20 }, undefined]);
    expect(moveScores(blackFirst)).toEqual([{ cp: 90 }, undefined, undefined]);
  });

  it('gives none in a game played without feedback', () => {
    expect(moveScores(unjudged)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('reviewEval', () => {
  it("keeps the human's latest score through the engine's reply", () => {
    expect(reviewEval(judged, 0)).toEqual({ cp: 30 });
    expect(reviewEval(judged, 1)).toEqual({ cp: 30 });
    expect(reviewEval(judged, 3)).toEqual({ cp: 20 });
  });

  it("is empty before the human's first move, and in a game without feedback", () => {
    expect(reviewEval(judged, -1)).toBeUndefined();
    expect(reviewEval(unjudged, 3)).toBeUndefined();
  });

  it('skips a move whose search was capped', () => {
    const capped = { ...judged, feedback: [{ score: { cp: 30 } }, null, {}, null] };
    expect(reviewEval(capped, 2)).toEqual({ cp: 30 });
  });

  it('reads a game black opened on its own moves', () => {
    expect(reviewEval(blackFirst, 1)).toEqual({ cp: 90 });
  });
});

describe('bestMoveInstead', () => {
  const positions = gamePositions(judged.startFen, judged.moves);

  it("reads the best move's SAN in the position the human moved from", () => {
    expect(bestMoveInstead(judged, positions, 2)).toBe('d2d4');
    expect(bestMoveInstead(blackFirst, [AFTER_E4], 0)).toBe('c7c5');
  });

  it("has none where the move played was best, on the engine's moves, and without feedback", () => {
    expect(bestMoveInstead(judged, positions, 0)).toBeUndefined();
    expect(bestMoveInstead(judged, positions, 1)).toBeUndefined();
    expect(bestMoveInstead(unjudged, positions, 2)).toBeUndefined();
  });
});

describe('verdictTally', () => {
  it("counts the human's verdicts", () => {
    expect(verdictTally(judged)).toEqual({
      great: 0,
      best: 1,
      excellent: 0,
      inaccuracy: 1,
      mistake: 0,
      blunder: 0,
    });
    expect(verdictTally(blackFirst)).toEqual({
      great: 1,
      best: 0,
      excellent: 0,
      inaccuracy: 0,
      mistake: 1,
      blunder: 0,
    });
  });

  it('is absent for a game played without verdicts', () => {
    expect(verdictTally(unjudged)).toBeUndefined();
  });
});
