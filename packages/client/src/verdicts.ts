import { pieceColorAt, turn, type GameState, type Verdict } from '@stratchess-ui/shared';

export type BoardVerdict = { square: string; verdict: Verdict };

/** The index in `moves` of the human's latest move, or undefined before they have moved. */
export function latestHumanPly(
  game: Pick<GameState, 'startFen' | 'moves' | 'humanColor'>,
): number | undefined {
  // The human's moves are every other one, starting with the first when they moved first.
  const firstHuman = turn(game.startFen) === game.humanColor ? 0 : 1;
  let latest = game.moves.length - 1;
  if ((latest - firstHuman) % 2 !== 0) latest -= 1;
  return latest < firstHuman ? undefined : latest;
}

/**
 * The verdict on the human's latest move, on the square it went to, or undefined once that square
 * no longer holds a piece of theirs: the badge must not sit on the piece that captured there.
 */
export function boardVerdict(
  game: Pick<GameState, 'startFen' | 'fen' | 'moves' | 'humanColor' | 'verdicts'>,
): BoardVerdict | undefined {
  const { fen, moves, humanColor, verdicts } = game;
  const latest = latestHumanPly(game);
  if (latest === undefined) return undefined;
  const verdict = verdicts?.[latest];
  // Standard UCI, so a castling king's square and a promotion's square are both the to-square.
  const square = moves[latest]!.slice(2, 4);
  if (!verdict || pieceColorAt(fen, square) !== humanColor) return undefined;
  return { square, verdict };
}

/** In the move list only the moves worth a second look carry their verdict. */
export function listsVerdict(verdict: Verdict | null | undefined): verdict is Verdict {
  return verdict === 'inaccuracy' || verdict === 'mistake' || verdict === 'blunder';
}
