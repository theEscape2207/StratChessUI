// Verdicts on the human's moves: how much win chance a move gave up against the engine's best. The
// scores come from two searches of the game's own engine, one of the position before the move and
// one of the position after it.
import type { Verdict } from '@stratchess-ui/shared';

/**
 * The analysis searches, the curve and the thresholds. The steepness is Lichess's, fitted to
 * Stockfish's centipawns, and the thresholds start from Lichess's too: both are tuned on the
 * owner's games.
 */
export const ANALYSIS: {
  depth: number;
  capMs: number;
  steepness: number;
  excellentBelow: number;
  drops: readonly { verdict: Verdict; from: number }[];
} = {
  /**
   * Of the position search, before the move. The reply search, after it, runs one ply shallower, so
   * both scores look equally far ahead from the human's position.
   */
  depth: 10,
  /** A search this stops gives no verdict: its score is from another depth. */
  capMs: 2000,
  steepness: 0.00368208,
  /** A move other than the best that drops less than this, in percentage points, is excellent. */
  excellentBelow: 2,
  /** The smallest drop for each verdict, in percentage points, worst first. */
  drops: [
    { verdict: 'blunder', from: 15 },
    { verdict: 'mistake', from: 10 },
    { verdict: 'inaccuracy', from: 5 },
  ],
};

/**
 * The chance of winning in percent, from a score in `scoreCp`'s centipawns: a mate either way is
 * far enough out on the curve to be 100 or 0.
 */
export function winChance(cp: number): number {
  return 100 / (1 + Math.exp(-ANALYSIS.steepness * cp));
}

/**
 * The verdict on a move that is not the engine's best, from both moves' scores for the mover, or
 * undefined for a drop too large to praise and too small to fault.
 */
export function verdictOf(bestCp: number, playedCp: number): Verdict | undefined {
  const drop = winChance(bestCp) - winChance(playedCp);
  if (drop < ANALYSIS.excellentBelow) return 'excellent';
  return ANALYSIS.drops.find(({ from }) => drop >= from)?.verdict;
}
