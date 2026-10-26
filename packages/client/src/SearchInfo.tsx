import { moveNumber, turn, type SearchReport } from '@stratchess-ui/shared';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function formatScore({ score, bound }: SearchReport): string | undefined {
  if (!score) return undefined;
  const value =
    'mate' in score ? `#${score.mate}` : `${score.cp > 0 ? '+' : ''}${(score.cp / 100).toFixed(2)}`;
  return bound ? `${bound === 'lower' ? '≥' : '≤'} ${value}` : value;
}

/** The PV numbered from the position searched: `14… Nf6 15. Nc3`. */
function numbered(fen: string, pv: readonly string[]): string {
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

/** The engine's latest search line; whatever the engine did not report is left out. */
export function SearchInfo({ fen, info }: { fen: string; info: SearchReport }) {
  const stats = [
    info.depth !== undefined &&
      `depth ${info.depth}${info.seldepth !== undefined ? `/${info.seldepth}` : ''}`,
    formatScore(info),
    info.nodes !== undefined && `${compact.format(info.nodes)} nodes`,
    info.nps !== undefined && `${compact.format(info.nps)} n/s`,
  ].filter(Boolean);
  return (
    <div className="search" data-testid="search">
      <p className="search-stats" data-testid="search-stats">
        {stats.join(' · ')}
      </p>
      {info.pv?.length ? (
        <p className="search-pv" data-testid="search-pv">
          {numbered(fen, info.pv)}
        </p>
      ) : null}
    </div>
  );
}
