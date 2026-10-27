import type { Color, Role } from '@stratchess-ui/shared';
import { sortCaptures, type Chip, type Side } from './strip.ts';

type PlayerStripProps = {
  side: Side;
  name: string;
  /** The engine's limit, or the human's colour. */
  detail: string;
  /** The pieces this side took, which are the other colour. */
  captured: readonly Role[];
  capturedColor: Color;
  lead?: number;
  chip: Chip;
};

/** One side's row by the board: who it is, what it has taken, and whose turn it is. */
export function PlayerStrip({
  side,
  name,
  detail,
  captured,
  capturedColor,
  lead,
  chip,
}: PlayerStripProps) {
  return (
    <section className={`player-strip ${side}`} aria-label={name} data-testid={`strip-${side}`}>
      <div className={`strip-tile ${side}`} aria-hidden="true">
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="strip-who">
        <p className="strip-name">
          {name} <span>{detail}</span>
        </p>
        {/* Pieces are drawn by Chessground's stylesheet, which applies inside a cg-wrap. */}
        <div className="strip-captures cg-wrap" data-testid="captures">
          {sortCaptures(captured).map((role, i) => (
            <piece
              key={i}
              className={`${role} ${capturedColor}`}
              role="img"
              aria-label={`${capturedColor} ${role}`}
            />
          ))}
          {lead !== undefined && <b data-testid="lead">+{lead}</b>}
        </div>
      </div>
      <span className={chip.raised ? 'strip-chip raised' : 'strip-chip'} data-testid="chip">
        {chip.text}
      </span>
    </section>
  );
}
