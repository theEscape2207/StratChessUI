import { applyUciMove } from '@stratchess-ui/shared';

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
