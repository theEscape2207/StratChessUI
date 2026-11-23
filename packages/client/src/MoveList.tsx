import { useEffect, useRef } from 'react';
import { moveNumber, sanMoves, turn, type Score, type Verdict } from '@stratchess-ui/shared';
import { formatScore } from './notation.ts';
import { QualityBadge } from './QualityBadge.tsx';
import { listsVerdict } from './verdicts.ts';

type MoveListProps = {
  startFen: string;
  moves: readonly string[];
  /** One per move, as in the game state. */
  verdicts?: readonly (Verdict | null)[];
  /** One per move, shown after its SAN; GameReview gives the human's. */
  scores?: readonly (Score | undefined)[];
  /**
   * GameReview: the index in `moves` of the move on the board, -1 at the start position, and every
   * move a button that selects it. Review shows every verdict, as its tally counts them all.
   */
  review?: { current: number; onSelect: (ply: number) => void };
};

/**
 * Scrolls the list, never the page, until `item` is in view: Chessground keeps the board's bounds
 * until it sees a scroll event, so moving the page under it would misplace taps.
 */
function keepInView(list: HTMLElement, item: HTMLElement) {
  const box = list.getBoundingClientRect();
  const { top, bottom } = item.getBoundingClientRect();
  if (top < box.top) list.scrollTop -= box.top - top;
  else if (bottom > box.bottom) list.scrollTop += bottom - box.bottom;
}

/**
 * The game's moves in SAN, a numbered row per white move and black's reply. A game from a FEN
 * keeps that FEN's move numbers and, when black moved first, opens with an empty white move.
 */
export function MoveList({ startFen, moves, verdicts, scores, review }: MoveListProps) {
  const sans: (string | undefined)[] = sanMoves(startFen, moves);
  // The empty white move shifts the list one place from the game's moves.
  const skipped = turn(startFen) === 'black' ? 1 : 0;
  if (skipped) sans.unshift(undefined);
  const first = moveNumber(startFen);
  const rows: [string | undefined, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([sans[i], sans[i + 1]]);
  const current = review ? review.current + skipped : sans.length - 1;
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const item = list.current?.querySelector<HTMLElement>('[aria-current]');
    if (list.current && item) keepInView(list.current, item);
  }, [current, moves.length]);
  const move = (side: 'white' | 'black', san: string, index: number) => {
    const ply = index - skipped;
    const verdict = verdicts?.[ply];
    const shown = verdict && (review || listsVerdict(verdict)) ? verdict : undefined;
    const score = scores?.[ply];
    const props = {
      className: index === current ? `${side} current` : side,
      'aria-current': index === current || undefined,
    };
    const content = (
      <>
        {shown && <QualityBadge verdict={shown} />}
        <span className="san">{san}</span>
        {score && <span className="score">{formatScore(score)}</span>}
      </>
    );
    if (!review) return <span {...props}>{content}</span>;
    return (
      <button type="button" {...props} onClick={() => review.onSelect(ply)}>
        {content}
      </button>
    );
  };
  return (
    <ol ref={list} className="move-list" aria-label="Moves" data-testid="moves">
      {rows.map(([white, black], i) => (
        <li key={i}>
          <span className="number">{first + i}.</span>
          {white ? move('white', white, 2 * i) : <span className="skipped">…</span>}
          {black && move('black', black, 2 * i + 1)}
        </li>
      ))}
    </ol>
  );
}
