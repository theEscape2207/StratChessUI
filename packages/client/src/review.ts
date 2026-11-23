import { applyUciMove, type GameState } from '@stratchess-ui/shared';

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
