import { castlingSide, Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { makeUci, opposite, parseUci } from 'chessops/util';
import type { Color, Outcome } from './protocol.ts';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type MoveResult = { ok: true; fen: string; uci: string } | { ok: false; reason: string };

export type FenResult = { ok: true; fen: string } | { ok: false; reason: string };

// chessops reports error codes; these are for the player.
const FEN_ERRORS: Record<string, string> = {
  ERR_FEN: 'not a FEN',
  ERR_BOARD: 'the board part is malformed',
  ERR_POCKETS: 'the board part is malformed',
  ERR_TURN: 'the side to move must be w or b',
  ERR_CASTLING: 'the castling field is malformed',
  ERR_EP_SQUARE: 'the en passant square is malformed',
  ERR_REMAINING_CHECKS: 'not a FEN',
  ERR_HALFMOVES: 'the half-move clock is malformed',
  ERR_FULLMOVES: 'the move number is malformed',
  ERR_EMPTY: 'the board is empty',
  ERR_KINGS: 'each side needs exactly one king',
  ERR_OPPOSITE_CHECK: 'the side not to move is in check',
  ERR_PAWNS_ON_BACKRANK: 'a pawn is on the first or last rank',
};

function positionFromFen(fen: string): Chess | string {
  const setup = parseFen(fen);
  if (setup.isErr) return `invalid FEN: ${FEN_ERRORS[setup.error.message] ?? setup.error.message}`;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return `illegal position: ${FEN_ERRORS[pos.error.message] ?? pos.error.message}`;
  return pos.value;
}

/**
 * Checks a FEN a game may start from and returns it normalised: missing fields filled in,
 * castling rights without their rooks and an en passant square no pawn can use dropped.
 */
export function parseStartFen(fen: string): FenResult {
  const trimmed = fen.trim();
  if (!trimmed) return { ok: false, reason: 'invalid FEN: empty' };
  const pos = positionFromFen(trimmed);
  if (typeof pos === 'string') return { ok: false, reason: pos };
  return { ok: true, fen: makeFen(pos.toSetup()) };
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

/** The SAN of each move of a game from `startFen`, stopping at any illegal move. */
export function sanMoves(startFen: string, moves: readonly string[]): string[] {
  const pos = positionFromFen(startFen);
  if (typeof pos === 'string') return [];
  const sans: string[] = [];
  for (const uci of moves) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) break;
    sans.push(makeSanAndPlay(pos, move));
  }
  return sans;
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

/** The full-move number of a normalised FEN. */
export function moveNumber(fen: string): number {
  return Number(fen.split(' ')[5] ?? 1);
}
