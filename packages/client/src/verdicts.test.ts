import { describe, expect, it } from 'vitest';
import {
  applyUciMove,
  START_FEN,
  type Color,
  type GameState,
  type Verdict,
} from '@stratchess-ui/shared';
import { boardVerdict, listsVerdict, plyVerdict } from './verdicts.ts';

const BLACK_FIRST = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';

/** The game state after `moves` from `startFen`, as the server would send it. */
function game(
  humanColor: Color,
  moves: string[],
  verdicts?: (Verdict | null)[],
  startFen = START_FEN,
): Pick<GameState, 'startFen' | 'fen' | 'moves' | 'humanColor' | 'verdicts'> {
  let fen = startFen;
  for (const uci of moves) {
    const result = applyUciMove(fen, uci);
    if (!result.ok) throw new Error(result.reason);
    fen = result.fen;
  }
  return { startFen, fen, moves, humanColor, verdicts };
}

describe('boardVerdict', () => {
  it("puts the human's latest verdict on its to-square, through the engine's reply", () => {
    expect(boardVerdict(game('white', ['e2e4'], ['best']))).toEqual({
      square: 'e4',
      verdict: 'best',
    });
    expect(boardVerdict(game('white', ['e2e4', 'e7e5'], ['best', null]))).toEqual({
      square: 'e4',
      verdict: 'best',
    });
  });

  it('finds the human playing black', () => {
    expect(boardVerdict(game('black', ['e2e4', 'e7e5'], [null, 'mistake']))).toEqual({
      square: 'e5',
      verdict: 'mistake',
    });
    expect(boardVerdict(game('black', ['e2e4'], [null]))).toBeUndefined();
    expect(boardVerdict(game('black', [], []))).toBeUndefined();
  });

  it('counts the moves from a FEN where black moves first', () => {
    const moves = ['e7e5', 'e2e4'];
    expect(boardVerdict(game('black', moves, ['inaccuracy', null], BLACK_FIRST))).toEqual({
      square: 'e5',
      verdict: 'inaccuracy',
    });
    expect(boardVerdict(game('white', moves, [null, 'blunder'], BLACK_FIRST))).toEqual({
      square: 'e4',
      verdict: 'blunder',
    });
    expect(boardVerdict(game('white', ['e7e5'], [null], BLACK_FIRST))).toBeUndefined();
  });

  it("shows a promotion on its last-rank square and castling on the king's", () => {
    const promoting = game('white', ['e7e8q'], ['best'], '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1');
    expect(boardVerdict(promoting)).toEqual({ square: 'e8', verdict: 'best' });
    const castling = game('white', ['e1g1'], ['excellent'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(boardVerdict(castling)).toEqual({ square: 'g1', verdict: 'excellent' });
  });

  it('hides once the engine captures on that square', () => {
    const moves = ['e2e4', 'd7d5', 'e4d5'];
    expect(boardVerdict(game('white', moves, ['best', null, 'mistake']))).toEqual({
      square: 'd5',
      verdict: 'mistake',
    });
    const recaptured = game('white', [...moves, 'd8d5'], ['best', null, 'mistake', null]);
    expect(boardVerdict(recaptured)).toBeUndefined();
  });

  it('shows nothing for a move without a verdict, or a game without analysis', () => {
    expect(boardVerdict(game('white', ['e2e4', 'e7e5'], [null, null]))).toBeUndefined();
    expect(boardVerdict(game('white', ['e2e4'], []))).toBeUndefined();
    expect(boardVerdict(game('white', ['e2e4']))).toBeUndefined();
  });

  it('goes back to the earlier move after a takeback', () => {
    const played = game(
      'white',
      ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
      ['excellent', null, 'blunder', null],
    );
    expect(boardVerdict(played)).toEqual({ square: 'f3', verdict: 'blunder' });
    const takenBack = game('white', ['e2e4', 'e7e5'], ['excellent', null]);
    expect(boardVerdict(takenBack)).toEqual({ square: 'e4', verdict: 'excellent' });
  });
});

it.each([
  ['best', false],
  ['excellent', false],
  ['inaccuracy', true],
  ['mistake', true],
  ['blunder', true],
  [null, false],
] as const)('lists %s in the move list: %s', (verdict, listed) => {
  expect(listsVerdict(verdict)).toBe(listed);
});

describe('plyVerdict', () => {
  it("puts a human move's verdict on its to-square, wherever the game has got to", () => {
    const played = game(
      'white',
      ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
      ['best', null, 'inaccuracy', null],
    );
    expect(plyVerdict(played, 0)).toEqual({ square: 'e4', verdict: 'best' });
    expect(plyVerdict(played, 2)).toEqual({ square: 'f3', verdict: 'inaccuracy' });
  });

  it('shows nothing for an engine move, the start position or a move without a verdict', () => {
    const played = game('black', ['e2e4', 'e7e5', 'g1f3'], ['mistake', null, 'best']);
    expect(plyVerdict(played, 0)).toBeUndefined();
    expect(plyVerdict(played, 1)).toBeUndefined();
    expect(plyVerdict(played, -1)).toBeUndefined();
  });

  it('counts the moves from a FEN where black moves first', () => {
    const played = game('black', ['e7e5', 'e2e4'], ['inaccuracy', 'blunder'], BLACK_FIRST);
    expect(plyVerdict(played, 0)).toEqual({ square: 'e5', verdict: 'inaccuracy' });
    expect(plyVerdict(played, 1)).toBeUndefined();
  });
});
