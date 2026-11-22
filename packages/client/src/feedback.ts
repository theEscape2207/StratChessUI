import {
  applyUciMove,
  sanMoves,
  type Feedback,
  type GameState,
  type Score,
  type Verdict,
} from '@stratchess-ui/shared';
import { latestHumanPly } from './verdicts.ts';

export type ShownFeedback = {
  san: string;
  verdict?: Verdict;
  score?: Score;
  best?: Feedback['best'];
  /** The position the move was played from, where the best move's PV starts. */
  fen: string;
};

const PHRASES: Record<Verdict, string> = {
  best: 'is best',
  excellent: 'is excellent',
  inaccuracy: 'is an inaccuracy',
  mistake: 'is a mistake',
  blunder: 'is a blunder',
};

export function verdictPhrase(verdict: Verdict): string {
  return PHRASES[verdict];
}

/**
 * The feedback on the human's latest move, kept through the engine's reply. Undefined when that move
 * has none, or none yet, so the last move's feedback goes as soon as the human moves again.
 */
export function shownFeedback(
  game: Pick<GameState, 'startFen' | 'moves' | 'humanColor' | 'verdicts' | 'feedback'>,
): ShownFeedback | undefined {
  const ply = latestHumanPly(game);
  if (ply === undefined) return undefined;
  const feedback = game.feedback?.[ply];
  if (!feedback) return undefined;
  const before = game.moves.slice(0, ply);
  let fen = game.startFen;
  for (const uci of before) {
    const result = applyUciMove(fen, uci);
    if (!result.ok) return undefined;
    fen = result.fen;
  }
  const san = sanMoves(fen, [game.moves[ply]!])[0];
  if (!san) return undefined;
  const verdict = game.verdicts?.[ply] ?? undefined;
  // The best row names its move by the PV's first; an empty PV leaves it nothing to name.
  const best = feedback.best?.pv.length ? feedback.best : undefined;
  return {
    san,
    fen,
    ...(verdict && { verdict }),
    ...(feedback.score && { score: feedback.score }),
    ...(best && { best }),
  };
}
