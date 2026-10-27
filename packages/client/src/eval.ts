import type { Color, Score, SearchReport } from '@stratchess-ui/shared';

/** Beyond eight pawns the bar stops at 5% or 95%; only mate fills it. */
const CLAMP_CP = 800;

/** White's share of the bar in percent; half before there is a score. */
export function evalFill(score: Score | undefined): number {
  if (!score) return 50;
  if ('mate' in score) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-CLAMP_CP, Math.min(CLAMP_CP, score.cp));
  return 50 + (cp / CLAMP_CP) * 45;
}

/** The side ahead, whose end of the bar carries the number; white at 0.00. */
export function evalLeader(score: Score): Color {
  return ('mate' in score ? score.mate > 0 : score.cp >= 0) ? 'white' : 'black';
}

/** The number on the bar, unsigned: `1.3`, `M4`. */
export function evalLabel(score: Score): string {
  if ('mate' in score) return `M${Math.abs(score.mate)}`;
  return (Math.abs(score.cp) / 100).toFixed(1);
}

export function evalAriaLabel(score: Score | undefined): string {
  if (!score) return 'Evaluation not yet known';
  if ('mate' in score) {
    return `${evalLeader(score) === 'white' ? 'White' : 'Black'} mates in ${Math.abs(score.mate)}`;
  }
  return `Evaluation ${score.cp >= 0 ? '+' : '-'}${evalLabel(score)} for white`;
}

/** Only an exact score moves the bar; a bound from an aspiration fail would make it jump. */
export function nextEval(last: Score | undefined, report: SearchReport): Score | undefined {
  return report.score && !report.bound ? report.score : last;
}
