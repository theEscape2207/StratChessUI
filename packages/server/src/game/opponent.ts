// The beginner opponent: every legal move is scored with one shallow search, then one is chosen by
// level, making deliberate mistakes and leaving some of the human's unpunished. Stock search limits
// cannot do this: even `go depth 1` wins any loose piece through quiescence.
import { legalMoves, outcome, turn, type Color, type Score } from '@stratchess-ui/shared';

export type Level = {
  /** Chance of trying a deliberate mistake on a turn. */
  mistakeChance: number;
  /** The smallest loss that counts as a mistake; the band leaves out the best move. */
  minLossCp: number;
  /** The largest loss a mistake may cost; 3000 includes giving up a mate. */
  maxLossCp: number;
  /** Moves this close to the best are treated as equal, so games do not repeat. */
  varietyCp: number;
  /** No deliberate mistakes at or below this best score: once behind, she has to earn the rest. */
  mistakeFloorCp: number | null;
  /**
   * Chance of missing a mate-in-one threat. A band capped below 3000 can never include a move that
   * allows mate, so without this no level short of a giveaway falls for Scholar's Mate.
   */
  mateBlindChance: number;
  /** At or below this best score, move at random, so she can finish a won game with a mate. */
  surrenderBelowCp: number | null;
  /** Resign after this many turns in a row surrendering: the tail of a game she cannot finish. */
  resignAfterTurns: number | null;
};

const BEGINNER = { minLossCp: 100, varietyCp: 20, mateBlindChance: 0 };
const FALLIBLE = { mistakeFloorCp: -100, surrenderBelowCp: -500, resignAfterTurns: 40 };
const RELENTLESS = { mistakeFloorCp: null, surrenderBelowCp: null, resignAfterTurns: null };

/**
 * Levels 1 to 5, as LEVEL_RANGE offers them. Scores are StratChess centipawns at `go depth 1`, which
 * the engine's UCI contract does not cover: recheck this table on adopting any engine release
 * (docs/Requirements.md). Level 2 is where a beginner starts; level 1 is a giveaway by design.
 */
export const LEVELS: readonly Level[] = [
  { ...BEGINNER, ...FALLIBLE, mistakeChance: 0.85, maxLossCp: 3000, mistakeFloorCp: null },
  { ...BEGINNER, ...FALLIBLE, mistakeChance: 0.7, maxLossCp: 1000, mateBlindChance: 0.15 },
  { ...BEGINNER, ...FALLIBLE, mistakeChance: 0.5, maxLossCp: 1000, mateBlindChance: 0.15 },
  { ...BEGINNER, ...RELENTLESS, mistakeChance: 0.3, maxLossCp: 1000 },
  { ...BEGINNER, ...RELENTLESS, mistakeChance: 0.15, maxLossCp: 500 },
];

export function levelOf(level: number): Level {
  return LEVELS[level - 1]!;
}

/** A legal move and its score from the mover's side, as the ranking orders them, best first. */
export type RankedMove = { uci: string; scoreCp: number };

const MATE_CP = 30_000;
const MATED_SOON_CP = -29_000;
/** Beyond this, a score is a mate rather than material. */
const MATE_ON_BOARD_CP = 10_000;
const LOSS_CAP_CP = 3000;

/** A score from the side to move in centipawns, a mate in N as ±(30000 − N). */
export function scoreCp(score: Score): number {
  if ('cp' in score) return score.cp;
  return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
}

/**
 * Searches the game after one more move, returning the score from the side to move then, which is
 * the mover's opponent.
 */
export type SearchChild = (uci: string) => Promise<Score>;

/**
 * Scores every legal move after `positions`, the game so far. A position the rules already decide
 * is scored here and never searched: StratChess answers a mated or stalemated root with `bestmove
 * 0000`, which the engine controller treats as a failure, and does not see a threefold repetition
 * by history. Returns undefined once `isGone` reports the turn taken back or the game ended; a
 * takeback's `stop` only cancels a search already running, so the next child must not start.
 */
export async function rankMoves(
  positions: readonly string[],
  search: SearchChild,
  isGone: () => boolean,
): Promise<RankedMove[] | undefined> {
  const fen = positions.at(-1)!;
  const mover = turn(fen);
  const ranked: RankedMove[] = [];
  for (const child of legalMoves(fen)) {
    if (isGone()) return undefined;
    const decided = outcome([...positions, child.fen]);
    const scored = decided ? decidedCp(decided.result, mover) : -scoreCp(await search(child.uci));
    ranked.push({ uci: child.uci, scoreCp: scored });
  }
  return ranked.sort((a, b) => b.scoreCp - a.scoreCp);
}

function decidedCp(result: Color | 'draw', mover: Color): number {
  if (result === 'draw') return 0;
  return result === mover ? MATE_CP : -MATE_CP;
}

/** Whether the level gives up on this turn: moving at random, and counting towards resigning. */
export function surrenders(ranked: readonly RankedMove[], level: Level): boolean {
  return level.surrenderBelowCp !== null && ranked[0]!.scoreCp <= level.surrenderBelowCp;
}

/** Whether the level resigns after this many turns in a row surrendering. */
export function resigns(surrenderedTurns: number, level: Level): boolean {
  return level.resignAfterTurns !== null && surrenderedTurns >= level.resignAfterTurns;
}

/** Chooses one of `ranked`, best first and not empty, by the level's settings. */
export function chooseMove(ranked: readonly RankedMove[], level: Level, rng: () => number): string {
  const best = ranked[0]!.scoreCp;
  const pick = (moves: readonly RankedMove[]) => moves[Math.floor(rng() * moves.length)]!.uci;
  if (surrenders(ranked, level)) return pick(ranked);
  // Not when a mate is already on the board either way, where blindness has no threat to miss.
  if (Math.abs(best) < MATE_ON_BOARD_CP && rng() < level.mateBlindChance) {
    const allowsMate = ranked.filter((m) => m.scoreCp <= MATED_SOON_CP);
    if (allowsMate.length > 0) return pick(allowsMate);
  }
  const loss = (m: RankedMove) => Math.min(best - m.scoreCp, LOSS_CAP_CP);
  const mayErr = level.mistakeFloorCp === null || best > level.mistakeFloorCp;
  if (mayErr && rng() < level.mistakeChance) {
    const band = ranked.filter((m) => loss(m) >= level.minLossCp && loss(m) <= level.maxLossCp);
    if (band.length > 0) return pick(band);
  }
  return pick(ranked.filter((m) => loss(m) <= level.varietyCp));
}
