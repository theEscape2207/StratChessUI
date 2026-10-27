import { castlingSide, Chess, IllegalSetup } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { InvalidFen, makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { isNormal, type Role } from 'chessops/types';
import { makeUci, opposite, parseUci, squareFile } from 'chessops/util';
import type { Color, Outcome } from './protocol.ts';

export type { Role };

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type MoveResult = { ok: true; fen: string; uci: string } | { ok: false; reason: string };

export type FenResult = { ok: true; fen: string } | { ok: false; reason: string };

// chessops reports error codes; these are for the player.
const FEN_ERRORS: Record<InvalidFen | IllegalSetup, string> = {
  [InvalidFen.Fen]: 'not a FEN',
  [InvalidFen.Board]: 'the board part is malformed',
  [InvalidFen.Pockets]: 'the board part is malformed',
  [InvalidFen.Turn]: 'the side to move must be w or b',
  [InvalidFen.Castling]: 'the castling field is malformed',
  [InvalidFen.EpSquare]: 'the en passant square is malformed',
  [InvalidFen.RemainingChecks]: 'not a FEN',
  [InvalidFen.Halfmoves]: 'the half-move clock is malformed',
  [InvalidFen.Fullmoves]: 'the move number is malformed',
  [IllegalSetup.Empty]: 'the board is empty',
  [IllegalSetup.Kings]: 'each side needs exactly one king',
  [IllegalSetup.OppositeCheck]: 'the side not to move is in check',
  [IllegalSetup.PawnsOnBackrank]: 'a pawn is on the first or last rank',
  [IllegalSetup.Variant]: 'not a standard chess position',
};

function positionFromFen(fen: string): Chess | string {
  const setup = parseFen(fen);
  if (setup.isErr)
    return `invalid FEN: ${FEN_ERRORS[setup.error.message as InvalidFen] ?? setup.error.message}`;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr)
    return `illegal position: ${FEN_ERRORS[pos.error.message as IllegalSetup] ?? pos.error.message}`;
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
 * The pieces each side took during a game from `startFen`, in the order taken. Replaying the moves
 * rather than counting against a full set keeps a FEN start's missing pieces out, shows a captured
 * promoted piece as what it became, and does not count a promoted pawn as taken.
 */
export function capturedPieces(startFen: string, moves: readonly string[]): Record<Color, Role[]> {
  const taken: Record<Color, Role[]> = { white: [], black: [] };
  const pos = positionFromFen(startFen);
  if (typeof pos === 'string') return taken;
  for (const uci of moves) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) break;
    if (isNormal(move)) {
      const mover = pos.board.get(move.from);
      const target = pos.board.get(move.to);
      if (target && target.color !== pos.turn) taken[pos.turn].push(target.role);
      // En passant: a pawn moving to another file onto an empty square.
      else if (!target && mover?.role === 'pawn' && squareFile(move.from) !== squareFile(move.to))
        taken[pos.turn].push('pawn');
    }
    pos.play(move);
  }
  return taken;
}

const PIECE_VALUES: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

/** White's material minus black's in pawns (1/3/3/5/9); 0 for a FEN that does not parse. */
export function materialBalance(fen: string): number {
  const pos = positionFromFen(fen);
  if (typeof pos === 'string') return 0;
  let balance = 0;
  for (const [, piece] of pos.board) {
    balance += (piece.color === 'white' ? 1 : -1) * PIECE_VALUES[piece.role];
  }
  return balance;
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

export function moveNumber(fen: string): number {
  const setup = parseFen(fen);
  return setup.isOk ? setup.value.fullmoves : 1;
}
