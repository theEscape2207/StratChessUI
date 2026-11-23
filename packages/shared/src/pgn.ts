import { defaultHeaders, extend, makePgn, Node, type PgnNodeData } from 'chessops/pgn';
import type { GameState, Strength, Verdict } from './protocol.ts';
import { sanMoves, START_FEN } from './rules.ts';

/**
 * PGN's numeric annotation glyphs: $1 good (!), $2 poor (?), $3 very good (!!), $4 very poor (??),
 * $6 dubious (?!).
 */
const VERDICT_NAGS: Record<Verdict, number> = {
  great: 3,
  best: 1,
  excellent: 1,
  inaccuracy: 6,
  mistake: 2,
  blunder: 4,
};

const RESULTS: Record<NonNullable<GameState['result']>, string> = {
  white: '1-0',
  black: '0-1',
  draw: '1/2-1/2',
};

export type PgnGame = Pick<
  GameState,
  'startFen' | 'moves' | 'humanColor' | 'engineName' | 'result' | 'verdicts'
> &
  Strength;

/**
 * The game so far as PGN, with the human's verdicts as glyphs. A game without a result, unfinished
 * or ended by an engine failure, reads `*`. The strength goes in tags of the app's own, which other
 * readers ignore.
 */
export function gamePgn(game: PgnGame, date: Date): string {
  const headers = defaultHeaders();
  headers.set('Date', pgnDate(date));
  const engine = game.engineName;
  headers.set('White', game.humanColor === 'white' ? 'You' : engine);
  headers.set('Black', game.humanColor === 'black' ? 'You' : engine);
  if (game.result) headers.set('Result', RESULTS[game.result]);
  if (game.startFen !== START_FEN) {
    headers.set('SetUp', '1');
    headers.set('FEN', game.startFen);
  }
  if ('level' in game) headers.set('Level', String(game.level));
  else if ('depth' in game.limit) headers.set('Depth', String(game.limit.depth));
  else headers.set('MoveTime', String(game.limit.movetimeMs));

  const moves = new Node<PgnNodeData>();
  extend(
    moves,
    sanMoves(game.startFen, game.moves).map((san, ply) => {
      const verdict = game.verdicts?.[ply];
      return verdict ? { san, nags: [VERDICT_NAGS[verdict]] } : { san };
    }),
  );
  return makePgn({ headers, moves });
}

/** PGN's date form, YYYY.MM.DD, in local time. */
function pgnDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}
