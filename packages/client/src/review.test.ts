import { expect, it } from 'vitest';
import { START_FEN } from '@stratchess-ui/shared';
import { gamePositions } from './review.ts';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

it('lists the start position and the one after each move', () => {
  expect(gamePositions(START_FEN, ['e2e4', 'e7e5'])).toEqual([START_FEN, AFTER_E4, AFTER_E4_E5]);
  expect(gamePositions(START_FEN, [])).toEqual([START_FEN]);
});

it('stops at a move that does not apply', () => {
  expect(gamePositions(START_FEN, ['e2e4', 'e2e4', 'e7e5'])).toEqual([START_FEN, AFTER_E4]);
});
