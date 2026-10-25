import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import type { Color } from './protocol.ts';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type MoveResult = { ok: true; fen: string } | { ok: false; reason: string };

function positionFromFen(fen: string): Chess | string {
  const setup = parseFen(fen);
  if (setup.isErr) return `invalid FEN: ${setup.error.message}`;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return `illegal position: ${pos.error.message}`;
  return pos.value;
}

/** Legal destinations per origin square, in the shape Chessground's `movable.dests` takes. */
export function legalDests(fen: string): Map<string, string[]> {
  const pos = positionFromFen(fen);
  if (typeof pos === 'string') return new Map();
  // chessops returns its own SquareName union; widen it for callers that use plain strings.
  return chessgroundDests(pos) as Map<string, string[]>;
}

export function applyUciMove(fen: string, uci: string): MoveResult {
  const pos = positionFromFen(fen);
  if (typeof pos === 'string') return { ok: false, reason: pos };
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return { ok: false, reason: `illegal move: ${uci}` };
  pos.play(move);
  return { ok: true, fen: makeFen(pos.toSetup()) };
}

/** 'white', 'black' or 'draw' once the game is over by rule; undefined while it goes on. */
export function outcome(fen: string): Color | 'draw' | undefined {
  const pos = positionFromFen(fen);
  if (typeof pos === 'string') return undefined;
  const result = pos.outcome();
  if (!result) return undefined;
  return result.winner ?? 'draw';
}

export function turn(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}
