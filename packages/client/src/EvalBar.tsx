import type { CSSProperties } from 'react';
import type { Color, Score } from '@stratchess-ui/shared';
import { evalAriaLabel, evalFill, evalLabel, evalLeader } from './eval.ts';

/**
 * White's share of the engine's evaluation, white's edge on the human's side: vertical beside the
 * board on GameScreen, a strip with no number above it on a phone.
 */
export function EvalBar({ score, orientation }: { score?: Score; orientation: Color }) {
  const fill = evalFill(score);
  const leader = score && evalLeader(score);
  return (
    <div
      className={`eval-bar orientation-${orientation}`}
      role="meter"
      aria-label={evalAriaLabel(score)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fill)}
      data-testid="eval-bar"
    >
      <div className="eval-white" style={{ '--fill': `${fill}%` } as CSSProperties} />
      {score && (
        <span className={`eval-number on-${leader}`} data-testid="eval-number">
          {evalLabel(score)}
        </span>
      )}
    </div>
  );
}
