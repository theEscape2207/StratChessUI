import type { Verdict } from '@stratchess-ui/shared';
import { QualityBadge } from './QualityBadge.tsx';
import type { Tally } from './review.ts';

const COLUMNS: [Verdict, string][][] = [
  [
    ['best', 'Best'],
    ['excellent', 'Excellent'],
  ],
  [
    ['inaccuracy', 'Inaccuracy'],
    ['mistake', 'Mistake'],
    ['blunder', 'Blunder'],
  ],
];

/** The human's verdict counts: the good moves on the left, the ones to look at again on the right. */
export function VerdictTally({ tally }: { tally: Tally }) {
  return (
    <div className="tally" aria-label="Your moves" data-testid="tally">
      {COLUMNS.map((column, i) => (
        <ul key={i}>
          {column.map(([verdict, word]) => (
            <li key={verdict}>
              {/* The word beside it says what the badge would announce. */}
              <span aria-hidden="true">
                <QualityBadge verdict={verdict} />
              </span>
              {word}
              <b>{tally[verdict]}</b>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
