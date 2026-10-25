import { castlingSide, Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci, opposite, parseUci } from 'chessops/util';
import type { Color, Outcome } from './protocol.ts';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type MoveResult = { ok: true; fen: string; uci: string } | { ok: false; reason: string };

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

/**
 * Plays a move given in UCI, or with the king dropped on its rook as Chessground allows. The
 * result's `uci` is standard UCI (castling moves the king two squares), the form engines accept.
 */
export function applyUciMove(fen: string, uci: string): MoveResult {
  const pos = positionFromFen(fen);
  if (typeof pos === 'string') return { ok: false, reason: pos };
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return { ok: false, reason: `illegal move: ${uci}` };
  const side = castlingSide(pos, move);
  const standard = side ? `${uci.slice(0, 2)}${side === 'h' ? 'g' : 'c'}${uci[1]}` : makeUci(move);
  pos.play(move);
  return { ok: true, fen: makeFen(pos.toSetup()), uci: standard };
}

/**
 * Decides a game from its positions so far, oldest first, or returns undefined while it goes on.
 * Threefold repetition and the fifty-move rule end the game at once rather than on a claim.
 */
export function outcome(positions: readonly string[]): Outcome | undefined {
  const fen = positions.at(-1);
  if (fen === undefined) return undefined;
  const pos = positionFromFen(fen);
  if (typeof pos === 'string') return undefined;
  // Checkmate on the hundredth half-move still wins, so the position's own rules come first.
  if (pos.isCheckmate()) return { result: opposite(pos.turn), termination: 'checkmate' };
  if (pos.isStalemate()) return { result: 'draw', termination: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { result: 'draw', termination: 'insufficient material' };
  if (pos.halfmoves >= 100) return { result: 'draw', termination: 'fifty-move rule' };
  const key = repetitionKey(fen);
  if (positions.filter((p) => repetitionKey(p) === key).length >= 3)
    return { result: 'draw', termination: 'threefold repetition' };
  return undefined;
}

/** Board, side to move, castling rights and en passant square, which FENs carry only when legal. */
function repetitionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function turn(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}
