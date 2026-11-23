import { moveNumber, sanMoves, turn, type Verdict } from '@stratchess-ui/shared';
import { QualityBadge } from './QualityBadge.tsx';
import { listsVerdict } from './verdicts.ts';

type MoveListProps = {
  startFen: string;
  moves: readonly string[];
  /** One per move, as in the game state. */
  verdicts?: readonly (Verdict | null)[];
  /**
   * GameReview: the index in `moves` of the move on the board, -1 at the start position, and every
   * move a button that selects it. Review shows every verdict, as its tally counts them all.
   */
  review?: { current: number; onSelect: (ply: number) => void };
};

/**
 * The game's moves in SAN, a numbered row per white move and black's reply. A game from a FEN
 * keeps that FEN's move numbers and, when black moved first, opens with an empty white move.
 */
export function MoveList({ startFen, moves, verdicts, review }: MoveListProps) {
  const sans: (string | undefined)[] = sanMoves(startFen, moves);
  // The empty white move shifts the list one place from the game's moves.
  const skipped = turn(startFen) === 'black' ? 1 : 0;
  if (skipped) sans.unshift(undefined);
  const first = moveNumber(startFen);
  const rows: [string | undefined, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([sans[i], sans[i + 1]]);
  const current = review ? review.current + skipped : sans.length - 1;
  const move = (side: 'white' | 'black', san: string, index: number) => {
    const ply = index - skipped;
    const verdict = verdicts?.[ply];
    const shown = verdict && (review || listsVerdict(verdict)) ? verdict : undefined;
    const props = {
      className: index === current ? `${side} current` : side,
      'aria-current': index === current || undefined,
    };
    const content = (
      <>
        {shown && <QualityBadge verdict={shown} />}
        <span className="san">{san}</span>
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
    <ol className="move-list" aria-label="Moves" data-testid="moves">
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
