import type { Score } from '@stratchess-ui/shared';
import { evalLeader } from './eval.ts';
import { verdictPhrase, type ShownFeedback } from './feedback.ts';
import { formatScore, numberedPv } from './notation.ts';
import { QualityBadge } from './QualityBadge.tsx';

function EvalChip({ score }: { score: Score }) {
  return (
    <span className={`feedback-chip ${evalLeader(score)}`} data-testid="feedback-chip">
      {formatScore(score)}
    </span>
  );
}

/**
 * The human's move against the engine's best. On a phone the best row gives way to a "Best was" line
 * under the headline; the stylesheet picks one or the other at the breakpoint. A best the move played
 * outscored in its own search is only the alternative: two searches disagreed, and neither is wrong.
 */
export function MoveFeedback({ feedback }: { feedback: ShownFeedback }) {
  const { san, verdict, mates, score, best, fen } = feedback;
  const bestSan = best?.pv[0];
  const badge = verdict && (mates ? 'mate' : verdict);
  const phrase = mates ? 'is checkmate' : verdict && verdictPhrase(verdict);
  return (
    <div className="move-feedback" data-testid="move-feedback">
      <div className="feedback-row" data-testid="feedback-played">
        {badge && <QualityBadge verdict={badge} />}
        <div className="feedback-text">
          <p className="feedback-head">
            <b>{san}</b>
            {phrase && <span> {phrase}</span>}
          </p>
          {best && (
            <p className="feedback-best-was" data-testid="feedback-best-was">
              {best.outscored ? 'Alternative' : 'Best'} was <b>{bestSan}</b> (
              {formatScore(best.score)})
            </p>
          )}
        </div>
        {score && <EvalChip score={score} />}
      </div>
      {best && (
        <div className="feedback-row feedback-best" data-testid="feedback-best">
          {!best.outscored && <QualityBadge verdict="best" />}
          <div className="feedback-text">
            <p className="feedback-head">
              <b>{bestSan}</b>
              <span> {best.outscored ? 'is the alternative' : verdictPhrase('best')}</span>
            </p>
            <p className="feedback-pv" data-testid="feedback-pv">
              {numberedPv(fen, best.pv)}
            </p>
          </div>
          <EvalChip score={best.score} />
        </div>
      )}
    </div>
  );
}
