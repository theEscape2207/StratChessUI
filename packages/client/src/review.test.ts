import { describe, expect, it } from 'vitest';
import { START_FEN } from '@stratchess-ui/shared';
import { boardAt, gamePositions } from './review.ts';

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
