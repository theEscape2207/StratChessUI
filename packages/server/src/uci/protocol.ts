// Pure UCI text handling: building commands safely and parsing engine output.
import type { Score, SearchLimit } from '@stratchess-ui/shared';

export type { Score, SearchLimit };

/** Longest engine line kept; anything longer is truncated before parsing. */
export const MAX_LINE_LENGTH = 16 * 1024;

const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export class UciCommandError extends Error {}

/** Rejects anything that could smuggle a second command onto the engine's stdin. */
export function assertSingleLine(value: string, what: string): string {
  if (/[\r\n\0]/.test(value)) throw new UciCommandError(`${what} contains a line break`);
  return value;
}

export function positionCommand(fen: string, moves: readonly string[]): string {
  assertSingleLine(fen, 'FEN');
  for (const move of moves) {
    if (!UCI_MOVE.test(move)) throw new UciCommandError(`not a UCI move: ${move}`);
  }
  return moves.length ? `position fen ${fen} moves ${moves.join(' ')}` : `position fen ${fen}`;
}

/** Always carries a limit: a bare `go` makes StratChess search to depth 20. */
export function goCommand(limit: SearchLimit): string {
  if ('depth' in limit) return `go depth ${positiveInt(limit.depth, 'depth')}`;
  return `go movetime ${positiveInt(limit.movetimeMs, 'movetime')}`;
}

export function setOptionCommand(name: string, value: string | number | boolean): string {
  assertSingleLine(name, 'option name');
  const text = assertSingleLine(String(value), 'option value');
  return `setoption name ${name} value ${text}`;
}

function positiveInt(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 1) throw new UciCommandError(`${what} must be >= 1`);
  return value;
}

export type UciOption = {
  name: string;
  type: string;
  default?: string;
  min?: number;
  max?: number;
  vars: string[];
};

/** Parses `option name <name...> type <t> [default <d>] [min <n>] [max <n>] [var <v>]...`. */
export function parseOption(line: string): UciOption | undefined {
  const match = /^option name (.+?) type (\S+)(.*)$/.exec(line);
  if (!match) return undefined;
  const [, name, type, rest] = match as unknown as [string, string, string, string];
  const option: UciOption = { name, type, vars: [] };
  const fields = /\s+(default|min|max|var)\s+(.*?)(?=\s+(?:default|min|max|var)\s|$)/g;
  for (const [, key, value = ''] of rest.matchAll(fields)) {
    if (key === 'default') option.default = value;
    else if (key === 'min') option.min = Number(value);
    else if (key === 'max') option.max = Number(value);
    else option.vars.push(value);
  }
  return option;
}

/** As the engine reports it: scores from the side to move, the PV in UCI. */
export type SearchInfo = {
  depth?: number;
  seldepth?: number;
  score?: Score;
  /** Set when the score is only a bound from an aspiration fail. */
  bound?: 'lower' | 'upper';
  nodes?: number;
  nps?: number;
  timeMs?: number;
  hashfull?: number;
  pv?: string[];
};

const NUMERIC: Record<string, keyof SearchInfo> = {
  depth: 'depth',
  seldepth: 'seldepth',
  nodes: 'nodes',
  nps: 'nps',
  time: 'timeMs',
  hashfull: 'hashfull',
};

/** Parses an `info` line with search data; `info string` and unknown lines return undefined. */
export function parseInfo(line: string): SearchInfo | undefined {
  const tokens = line.split(/\s+/);
  if (tokens[0] !== 'info' || tokens[1] === 'string') return undefined;
  const info: SearchInfo = {};
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]!;
    const numericKey = NUMERIC[token];
    if (numericKey) {
      (info as Record<string, number>)[numericKey] = Number(tokens[++i]);
    } else if (token === 'score') {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      info.score = kind === 'mate' ? { mate: value } : { cp: value };
    } else if (token === 'lowerbound') {
      info.bound = 'lower';
    } else if (token === 'upperbound') {
      info.bound = 'upper';
    } else if (token === 'pv') {
      info.pv = tokens.slice(i + 1);
      break;
    } else if (token === 'string') {
      break;
    }
  }
  return info.depth === undefined && !info.pv ? undefined : info;
}

/** The move from `bestmove <move> [ponder <move>]`, or undefined for other lines. */
export function parseBestMove(line: string): string | undefined {
  const match = /^bestmove (\S+)/.exec(line);
  return match?.[1];
}

/**
 * StratChess's only signal that `position` was not applied; it then searches the start position
 * (theEscape2207/StratChess#917).
 */
export function isRejectedPosition(line: string): boolean {
  return (
    line.startsWith('info string position: rejected FEN') ||
    (line.startsWith('info string position: illegal move') &&
      line.endsWith('move list not applied'))
  );
}
