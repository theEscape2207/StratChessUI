import { sanMoves } from '@stratchess-ui/shared';

/** The game's moves in SAN, a numbered row per white move and black's reply. */
export function MoveList({ moves }: { moves: readonly string[] }) {
  const sans = sanMoves(moves);
  const rows: [string, string | undefined][] = [];
  for (let i = 0; i < sans.length; i += 2) rows.push([sans[i]!, sans[i + 1]]);
  return (
    <ol className="move-list" aria-label="Moves" data-testid="moves">
      {rows.map(([white, black], i) => (
        <li key={i}>
          <span className="number">{i + 1}.</span>
          <span className="white">{white}</span>
          {black && <span className="black">{black}</span>}
        </li>
      ))}
    </ol>
  );
}
