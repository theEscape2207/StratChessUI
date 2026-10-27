// A stand-in UCI engine for tests, replaying lines recorded from StratChess (main, 2026-10-26).
// Run as `node fake-engine.ts [--mode=<mode>]`. Modes:
//   normal          behaves like StratChess
//   no-uciok        never finishes the handshake
//   crash-on-go     exits as soon as a search starts
//   ignore-stop     never answers `stop` (and searches forever)
//   legal           like normal, but answers the first legal move, so whole games can be played
//   chatty          like legal, with 1100 info strings in the handshake, the last 2000 characters
import { createInterface } from 'node:readline';
import { applyUciMove, legalDests, START_FEN } from '@stratchess-ui/shared';

const mode = process.argv.find((a) => a.startsWith('--mode='))?.slice(7) ?? 'normal';

const HANDSHAKE = [
  'id name StratChess',
  'id author Thees',
  'option name Threads type spin default 1 min 1 max 32',
  'option name Hash type spin default 192 min 1 max 1536',
  'option name SingularExtensions type check default true',
  'option name Contempt type spin default 0 min 0 max 100',
];

const SEARCH = [
  'info depth 1 seldepth 1 score cp 36 nodes 20 nps 20000 hashfull 0 time 0 pv e2e4',
  'info depth 2 seldepth 4 score cp 0 nodes 95 nps 95000 hashfull 0 time 0 pv e2e4 e7e5',
  'info depth 3 seldepth 7 score cp 29 nodes 798 nps 798000 hashfull 0 time 0 pv d2d4 d7d5 g1f3',
];
const SEARCH_END = [
  'info depth 3 seldepth 7 score cp 29 nodes 798 nps 798000 hashfull 0 time 0 pv d2d4 d7d5 g1f3',
  'info string treenodes main 751 qs 47',
];

const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
// In any mode, a game from here crashes the engine on its first search.
const CRASH = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';

const out = (line: string) => process.stdout.write(`${line}\n`);

let searching: { timer?: NodeJS.Timeout } | undefined;
let position = 'startpos';

function finishSearch() {
  if (!searching) return;
  clearTimeout(searching.timer);
  searching = undefined;
  SEARCH_END.map(withLegalPv).forEach(out);
  // Encodes the position it searched, so tests can tell which search a bestmove belongs to.
  if (position.includes(STALEMATE)) out('bestmove 0000');
  else if (mode === 'legal' || mode === 'chatty') out(`bestmove ${firstLegalMove(position)}`);
  else out(`bestmove ${position.includes('moves') ? 'g8f6' : 'b1c3'}`);
}

/** Plays a `position` command's moves, failing on any StratChess would reject. */
function replay(command: string): { fen: string } | { illegal: string } {
  const [setup, moves = ''] = command.split(' moves ');
  let fen = setup!.startsWith('position fen ') ? setup!.slice(13) : START_FEN;
  for (const move of moves.split(' ').filter(Boolean)) {
    const result = applyUciMove(fen, move);
    // Standard UCI castles king two squares; king-takes-rook is chessops' form, not StratChess's.
    if (!result.ok || castlesOntoRook(fen, move)) return { illegal: move };
    fen = result.fen;
  }
  return { fen };
}

function castlesOntoRook(fen: string, move: string): boolean {
  const pieceAt = (square: string) => {
    const row = fen.split('/')[8 - Number(square[1])]!.replace(/\d/g, (n) => '.'.repeat(+n));
    return row[square.charCodeAt(0) - 'a'.charCodeAt(0)];
  };
  const [from, to] = [pieceAt(move.slice(0, 2)), pieceAt(move.slice(2, 4))];
  return (from === 'K' && to === 'R') || (from === 'k' && to === 'r');
}

/**
 * The recorded PVs are from the start position; elsewhere a line's PV becomes as many first legal
 * moves in a row, so the PV a test sees is always legal from the position searched.
 */
function withLegalPv(line: string): string {
  const [head, pv] = line.split(' pv ');
  const replayed = replay(position);
  if (pv === undefined || 'illegal' in replayed || replayed.fen === START_FEN) return line;
  let fen = replayed.fen;
  const moves: string[] = [];
  const plies = pv.split(' ').length;
  while (moves.length < plies) {
    const move = firstLegalMoveFrom(fen);
    if (!move) break;
    moves.push(move);
    fen = (applyUciMove(fen, move) as { fen: string }).fen;
  }
  return moves.length ? `${head} pv ${moves.join(' ')}` : head!;
}

function firstLegalMove(command: string): string {
  const replayed = replay(command);
  if ('illegal' in replayed) return '0000';
  return firstLegalMoveFrom(replayed.fen) ?? '0000';
}

function firstLegalMoveFrom(fen: string): string | undefined {
  for (const [from, dests] of legalDests(fen)) {
    const move = `${from}${dests[0]}`;
    return applyUciMove(fen, move).ok ? move : `${move}q`;
  }
  return undefined;
}

createInterface({ input: process.stdin }).on('line', (line) => {
  const [command] = line.split(' ');
  if (searching && command !== 'stop' && command !== 'isready' && command !== 'quit') {
    out(`info string ${command}: ignored, a search is in progress -- send 'stop' first`);
    return;
  }
  switch (command) {
    case 'uci':
      HANDSHAKE.forEach(out);
      if (mode === 'chatty') {
        for (let i = 0; i < 1100; i++) out(`info string chatter ${i}`);
        out(`info string ${'x'.repeat(2000 - 'info string '.length)}`);
      }
      if (mode !== 'no-uciok') out('uciok');
      break;
    case 'isready':
      out('readyok');
      break;
    case 'position': {
      if (line.startsWith('position fen ') && line.split(' ').length < 8) {
        out('info string position: rejected FEN, board reset to the starting position');
        position = 'startpos';
        break;
      }
      const replayed = replay(line);
      if ('illegal' in replayed) {
        out(`info string position: illegal move '${replayed.illegal}', move list not applied`);
        position = 'startpos';
      } else {
        position = line;
      }
      break;
    }
    case 'go': {
      if (mode === 'crash-on-go' || position.includes(CRASH)) process.exit(3);
      SEARCH.map(withLegalPv).forEach(out);
      searching = {};
      const movetime = /movetime (\d+)/.exec(line);
      if (mode === 'ignore-stop') break;
      if (movetime) searching.timer = setTimeout(finishSearch, Number(movetime[1]));
      else if (/depth/.test(line)) finishSearch();
      break;
    }
    case 'stop':
      if (mode !== 'ignore-stop') finishSearch();
      break;
    case 'quit':
      process.exit(0);
  }
});
