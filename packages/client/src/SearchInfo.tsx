import type { SearchReport } from '@stratchess-ui/shared';
import { formatScore, numberedPv } from './notation.ts';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function scoreText({ score, bound }: SearchReport): string | undefined {
  if (!score) return undefined;
  const value = formatScore(score);
  return bound ? `${bound === 'lower' ? '≥' : '≤'} ${value}` : value;
}

/** The engine's latest search line; whatever the engine did not report is left out. */
export function SearchInfo({ fen, info }: { fen: string; info: SearchReport }) {
  const stats = [
    info.depth !== undefined &&
      `depth ${info.depth}${info.seldepth !== undefined ? `/${info.seldepth}` : ''}`,
    scoreText(info),
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
          {numberedPv(fen, info.pv)}
        </p>
      ) : null}
    </div>
  );
}
