// A stand-in UCI engine for tests, replaying lines recorded from StratChess (main, 2026-10-25).
// Run as `node fake-engine.ts [--mode=<mode>]`. Modes:
//   normal          behaves like StratChess
//   no-uciok        never finishes the handshake
//   crash-on-go     exits as soon as a search starts
//   ignore-stop     never answers `stop` (and searches forever)
//   legal           like normal, but answers the first legal move, so whole games can be played
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
  'info depth 1 score cp 35 nodes 34 hashfull 0 time 0 pv d2d4',
  'info depth 2 score cp 18 nodes 173 hashfull 0 time 0 pv d2d4 d7d6',
  'info depth 3 score cp 25 nodes 2136 hashfull 0 time 1 pv b1c3 b8c6 f1c4',
];
const SEARCH_END = [
  'info depth 3 score cp 25 nodes 2136 hashfull 0 time 1 pv b1c3',
  'info string treenodes main 1800 qs 336',
];

const STALEMATE = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';

const out = (line: string) => process.stdout.write(`${line}\n`);

let searching: { timer?: NodeJS.Timeout } | undefined;
let position = 'startpos';

function finishSearch() {
  if (!searching) return;
  clearTimeout(searching.timer);
  searching = undefined;
  SEARCH_END.forEach(out);
  // Encodes the position it searched, so tests can tell which search a bestmove belongs to.
  if (position.includes(STALEMATE)) out('bestmove 0000');
  else if (mode === 'legal') out(`bestmove ${firstLegalMove(position)}`);
  else out(`bestmove ${position.includes('moves') ? 'g8f6' : 'b1c3'}`);
}

function firstLegalMove(command: string): string {
  const [setup, moves = ''] = command.split(' moves ');
  let fen = setup!.startsWith('position fen ') ? setup!.slice(13) : START_FEN;
  for (const move of moves.split(' ').filter(Boolean)) {
    const result = applyUciMove(fen, move);
    if (result.ok) fen = result.fen;
  }
  for (const [from, dests] of legalDests(fen)) {
    const move = `${from}${dests[0]}`;
    return applyUciMove(fen, move).ok ? move : `${move}q`;
  }
  return '0000';
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
      if (mode !== 'no-uciok') out('uciok');
      break;
    case 'isready':
      out('readyok');
      break;
    case 'position': {
      // A null move like a1a1 stands in for any illegal move.
      const illegal = line
        .split(' moves ')[1]
        ?.split(' ')
        .find((m) => m.slice(0, 2) === m.slice(2, 4));
      if (line.startsWith('position fen ') && line.split(' ').length < 8) {
        out('info string position: rejected FEN, board reset to the starting position');
        position = 'startpos';
      } else if (illegal) {
        out(`info string position: illegal move '${illegal}', move list not applied`);
        position = 'startpos';
      } else {
        position = line;
      }
      break;
    }
    case 'go': {
      if (mode === 'crash-on-go') process.exit(3);
      SEARCH.forEach(out);
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
