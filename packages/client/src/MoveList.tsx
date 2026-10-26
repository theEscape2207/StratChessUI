import { moveNumber, sanMoves, turn } from '@stratchess-ui/shared';

/**
 * The game's moves in SAN, a numbered row per white move and black's reply. A game from a FEN
 * keeps that FEN's move numbers and, when black moved first, opens with an empty white move.
 */
export function MoveList({ startFen, moves }: { startFen: string; moves: readonly string[] }) {
  const sans: (string | undefined)[] = sanMoves(startFen, moves);
  if (turn(startFen) === 'black') sans.unshift(undefined);
  const first = moveNumber(startFen);
  const rows: [string | undefined, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([sans[i], sans[i + 1]]);
  return (
    <ol className="move-list" aria-label="Moves" data-testid="moves">
      {rows.map(([white, black], i) => (
        <li key={i}>
          <span className="number">{first + i}.</span>
          {white ? <span className="white">{white}</span> : <span className="skipped">…</span>}
          {black && <span className="black">{black}</span>}
        </li>
      ))}
    </ol>
  );
}
