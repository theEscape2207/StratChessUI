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
  const last = sans.length - 1;
  const move = (side: 'white' | 'black', san: string, index: number) =>
    index === last ? (
      <span className={`${side} current`} aria-current="true">
        {san}
      </span>
    ) : (
      <span className={side}>{san}</span>
    );
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
