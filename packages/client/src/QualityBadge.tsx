import type { CSSProperties } from 'react';
import type { Color } from '@stratchess-ui/shared';
import type { Badge, BoardVerdict } from './verdicts.ts';

const GLYPHS: Record<Badge, string> = {
  great: '!!',
  best: '★',
  excellent: '!',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
  mate: '#',
};

/** A verdict as a round glyph. The glyph is only a picture: its word is what is announced. */
export function QualityBadge({ verdict }: { verdict: Badge }) {
  return (
    <span
      className={`quality-badge ${verdict}`}
      role="img"
      aria-label={verdict === 'mate' ? 'checkmate' : verdict}
      data-testid="quality-badge"
    >
      {GLYPHS[verdict]}
    </span>
  );
}

/**
 * A verdict over the board, on a square's top-right corner as the player sees it. The stylesheet
 * keeps it inside the board on the edge squares, where it would otherwise widen a phone's page.
 */
export function BoardBadge({
  square,
  verdict,
  orientation,
}: BoardVerdict & { orientation: Color }) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const column = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return (
    <div
      className="board-badge"
      data-testid="board-badge"
      data-square={square}
      style={{ '--column': column, '--row': row } as CSSProperties}
    >
      <QualityBadge verdict={verdict} />
    </div>
  );
}
