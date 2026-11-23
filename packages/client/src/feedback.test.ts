import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  type Color,
  type Feedback,
  type GameState,
  type Verdict,
} from '@stratchess-ui/shared';
import { shownFeedback, verdictPhrase } from './feedback.ts';

const BLACK_FIRST = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

const scored = (cp: number): Feedback => ({ score: { cp } });

function game(
  humanColor: Color,
  moves: string[],
  feedback?: (Feedback | null)[],
  verdicts?: (Verdict | null)[],
  startFen = START_FEN,
): Pick<GameState, 'startFen' | 'moves' | 'humanColor' | 'verdicts' | 'feedback'> {
  return { startFen, moves, humanColor, feedback, verdicts };
}

describe('shownFeedback', () => {
  it("shows the human's latest move, through the engine's reply", () => {
    const shown = { san: 'e4', fen: START_FEN, verdict: 'best', score: { cp: 30 } };
    expect(shownFeedback(game('white', ['e2e4'], [scored(30)], ['best']))).toEqual(shown);
    const replied = game('white', ['e2e4', 'e7e5'], [scored(30), null], ['best', null]);
    expect(shownFeedback(replied)).toEqual(shown);
  });

  it("starts the best move's line from the position the move was played in", () => {
    const best = { score: { cp: 20 }, pv: ['Nf3', 'Nc6'] };
    const played = game(
      'white',
      ['e2e4', 'e7e5', 'a2a3'],
      [scored(30), null, { score: { cp: -40 }, best }],
      ['best', null, 'inaccuracy'],
    );
    expect(shownFeedback(played)).toEqual({
      san: 'a3',
      fen: AFTER_E4_E5,
      verdict: 'inaccuracy',
      score: { cp: -40 },
      best,
    });
  });

  it('shows nothing for a move with no feedback yet, rather than the one before', () => {
    const moved = game('white', ['e2e4', 'e7e5', 'g1f3'], [scored(30), null], ['best', null]);
    expect(shownFeedback(moved)).toBeUndefined();
    const searchless = game('white', ['e2e4', 'e7e5', 'g1f3'], [scored(30), null, null]);
    expect(shownFeedback(searchless)).toBeUndefined();
  });

  it('goes back to the earlier move after a takeback', () => {
    const takenBack = game('white', ['e2e4', 'e7e5'], [scored(30), null]);
    expect(shownFeedback(takenBack)).toMatchObject({ san: 'e4' });
  });

  it('finds the human playing black, from a FEN where black moves first too', () => {
    const black = game('black', ['e2e4', 'e7e5'], [null, scored(-10)]);
    expect(shownFeedback(black)).toMatchObject({ san: 'e5', fen: AFTER_E4 });
    expect(shownFeedback(game('black', ['e2e4'], [null]))).toBeUndefined();
    const first = game('black', ['e7e5'], [scored(0)], undefined, BLACK_FIRST);
    expect(shownFeedback(first)).toMatchObject({ san: 'e5', fen: BLACK_FIRST });
  });

  it('shows a move with no verdict or no score without them', () => {
    expect(shownFeedback(game('white', ['e2e4'], [scored(30)], [null]))).toEqual({
      san: 'e4',
      fen: START_FEN,
      score: { cp: 30 },
    });
    expect(shownFeedback(game('white', ['e2e4'], [{}], ['best']))).toEqual({
      san: 'e4',
      fen: START_FEN,
      verdict: 'best',
    });
  });

  it("shows a given move when it is the human's, and nothing for an engine move or the start", () => {
    const played = game(
      'white',
      ['e2e4', 'e7e5', 'a2a3'],
      [scored(30), scored(25), scored(-40)],
      ['best', null, 'inaccuracy'],
    );
    expect(shownFeedback(played, 0)).toEqual({
      san: 'e4',
      fen: START_FEN,
      verdict: 'best',
      score: { cp: 30 },
    });
    expect(shownFeedback(played, 1)).toBeUndefined();
    expect(shownFeedback(played, -1)).toBeUndefined();
    const black = game(
      'black',
      ['e7e5', 'e2e4', 'd7d5'],
      [scored(0), null, scored(10)],
      undefined,
      BLACK_FIRST,
    );
    expect(shownFeedback(black, 0)).toMatchObject({ san: 'e5', fen: BLACK_FIRST });
    expect(shownFeedback(black, 2)).toMatchObject({ san: 'd5' });
    expect(shownFeedback(black, 1)).toBeUndefined();
  });

  it('shows nothing without analysis', () => {
    expect(shownFeedback(game('white', ['e2e4']))).toBeUndefined();
    expect(shownFeedback(game('white', []))).toBeUndefined();
  });
});

it.each([
  ['great', 'is the only good move'],
  ['best', 'is best'],
  ['excellent', 'is excellent'],
  ['inaccuracy', 'is an inaccuracy'],
  ['mistake', 'is a mistake'],
  ['blunder', 'is a blunder'],
] as const)('the headline says %s as "%s"', (verdict, phrase) => {
  expect(verdictPhrase(verdict)).toBe(phrase);
});
