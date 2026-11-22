import { moveNumber, turn, type Score } from '@stratchess-ui/shared';

/** Signed pawns, or `#3` / `#-3` for mate; from white's side, as the server sends it. */
export function formatScore(score: Score): string {
  if ('mate' in score) return `#${score.mate}`;
  return `${score.cp > 0 ? '+' : ''}${(score.cp / 100).toFixed(2)}`;
}

/** A PV numbered from the position it starts in: `14… Nf6 15. Nc3`. */
export function numberedPv(fen: string, pv: readonly string[]): string {
  let number = moveNumber(fen);
  let white = turn(fen) === 'white';
  return pv
    .map((san, i) => {
      const text = white ? `${number}. ${san}` : i === 0 ? `${number}… ${san}` : san;
      if (!white) number++;
      white = !white;
      return text;
    })
    .join(' ');
}
