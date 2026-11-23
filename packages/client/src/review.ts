import {
  applyUciMove,
  sanToUci,
  type GameState,
  type Score,
  type Verdict,
} from '@stratchess-ui/shared';

type JudgedMoves = Pick<GameState, 'moves' | 'verdicts' | 'feedback'>;

/**
 * The position after each move of a game, the start first, so `positions[n]` follows `n` moves.
 * Stops at a move that does not apply, which the server never sends.
 */
export function gamePositions(startFen: string, moves: readonly string[]): string[] {
  const positions = [startFen];
  for (const uci of moves) {
    const result = applyUciMove(positions.at(-1)!, uci);
    if (!result.ok) break;
    positions.push(result.fen);
  }
  return positions;
}

/** The board after `step` of the game's moves; the server's own position where the replay fell short. */
export function boardAt(
  game: Pick<GameState, 'fen' | 'moves' | 'lastMove'>,
  positions: readonly string[],
  step: number,
): { fen: string; lastMove?: string } {
  const fen = positions[step];
  if (fen === undefined) {
    return { fen: game.fen, ...(game.lastMove && { lastMove: game.lastMove }) };
  }
  const lastMove = game.moves[step - 1];
  return { fen, ...(lastMove && { lastMove }) };
}

// The server stores verdicts and feedback for the human's moves only, `null` on the engine's.

/** The MoveList's score per move: the stored one on each of the human's moves, none on the engine's. */
export function moveScores(game: JudgedMoves): (Score | undefined)[] {
  return game.moves.map((_, ply) => game.feedback?.[ply]?.score);
}

/**
 * The EvalBar's score with the move at index `ply` on the board: the human's latest scored move at
 * or before it, so stepping onto the engine's reply keeps the bar still. Undefined before any.
 */
export function reviewEval(game: JudgedMoves, ply: number): Score | undefined {
  for (let at = ply; at >= 0; at--) {
    const score = game.feedback?.[at]?.score;
    if (score) return score;
  }
  return undefined;
}

/**
 * The engine's best move in standard UCI where the human's move at index `ply` was not it, read in
 * the position the move was played from.
 */
export function bestMoveInstead(
  game: JudgedMoves,
  positions: readonly string[],
  ply: number,
): string | undefined {
  const san = game.feedback?.[ply]?.best?.pv[0];
  const fen = positions[ply];
  return san === undefined || fen === undefined ? undefined : sanToUci(fen, san);
}

export type Tally = Record<Verdict, number>;

/** How many of the human's moves earned each verdict; undefined for a game played without them. */
export function verdictTally(game: JudgedMoves): Tally | undefined {
  if (!game.verdicts) return undefined;
  const tally: Tally = { best: 0, excellent: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const verdict of game.verdicts) if (verdict) tally[verdict]++;
  return tally;
}
