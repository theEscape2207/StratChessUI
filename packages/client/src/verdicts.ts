import { pieceColorAt, turn, type GameState, type Verdict } from '@stratchess-ui/shared';

export type BoardVerdict = { square: string; verdict: Verdict };

/** The human's moves are every other one in `moves`, starting with the first when they moved first. */
export function isHumanPly(game: Pick<GameState, 'startFen' | 'humanColor'>, ply: number): boolean {
  const firstHuman = turn(game.startFen) === game.humanColor ? 0 : 1;
  return ply >= firstHuman && (ply - firstHuman) % 2 === 0;
}

/** The index in `moves` of the human's latest move, or undefined before they have moved. */
export function latestHumanPly(
  game: Pick<GameState, 'startFen' | 'moves' | 'humanColor'>,
): number | undefined {
  const latest = game.moves.length - 1;
  if (isHumanPly(game, latest)) return latest;
  return isHumanPly(game, latest - 1) ? latest - 1 : undefined;
}

/** The verdict on the move at index `ply`, on the square it went to, when it is a judged human move. */
export function plyVerdict(
  game: Pick<GameState, 'startFen' | 'moves' | 'humanColor' | 'verdicts'>,
  ply: number,
): BoardVerdict | undefined {
  const verdict = game.verdicts?.[ply];
  if (!verdict || !isHumanPly(game, ply)) return undefined;
  // Standard UCI, so a castling king's square and a promotion's square are both the to-square.
  return { square: game.moves[ply]!.slice(2, 4), verdict };
}

/**
 * The verdict on the human's latest move, on the square it went to, or undefined once that square
 * no longer holds a piece of theirs: the badge must not sit on the piece that captured there.
 */
export function boardVerdict(
  game: Pick<GameState, 'startFen' | 'fen' | 'moves' | 'humanColor' | 'verdicts'>,
): BoardVerdict | undefined {
  const latest = latestHumanPly(game);
  const shown = latest === undefined ? undefined : plyVerdict(game, latest);
  if (!shown || pieceColorAt(game.fen, shown.square) !== game.humanColor) return undefined;
  return shown;
}

/** In the move list only the moves worth a second look carry their verdict. */
export function listsVerdict(verdict: Verdict | null | undefined): verdict is Verdict {
  return verdict === 'inaccuracy' || verdict === 'mistake' || verdict === 'blunder';
}
