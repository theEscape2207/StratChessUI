import { makeFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { describe, expect, it } from 'vitest';
import { gamePgn, type PgnGame } from './pgn.ts';
import { applyUciMove, START_FEN } from './rules.ts';

const DATE = new Date(2026, 0, 5);

function game(overrides: Partial<PgnGame> = {}): PgnGame {
  return {
    startFen: START_FEN,
    moves: [],
    humanColor: 'white',
    engineName: 'Advanced',
    limit: { depth: 8 },
    ...overrides,
  };
}

function finalFen(startFen: string, moves: string[]): string {
  return moves.reduce((fen, uci) => {
    const result = applyUciMove(fen, uci);
    if (!result.ok) throw new Error(result.reason);
    return result.fen;
  }, startFen);
}

/** Reads the PGN back with chessops and plays it out, as an outside analysis board would. */
function replay(pgn: string) {
  const [parsed] = parsePgn(pgn);
  const pos = startingPosition(parsed!.headers).unwrap();
  const nags: (number[] | undefined)[] = [];
  for (const node of parsed!.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move) throw new Error(`illegal SAN ${node.san}`);
    pos.play(move);
    nags.push(node.nags);
  }
  return { headers: Object.fromEntries(parsed!.headers), fen: makeFen(pos.toSetup()), nags };
}

describe('gamePgn', () => {
  it('replays to the game and marks only the human moves that have a verdict', () => {
    const moves = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5'];
    const { headers, fen, nags } = replay(
      gamePgn(
        game({
          moves,
          verdicts: ['best', null, 'excellent', null, null, null, 'inaccuracy'],
        }),
        DATE,
      ),
    );
    expect(fen).toBe(finalFen(START_FEN, moves));
    expect(nags).toEqual([[1], undefined, [1], undefined, undefined, undefined, [6]]);
    expect(headers).toMatchObject({
      Date: '2026.01.05',
      White: 'You',
      Black: 'Advanced',
      Result: '*',
      Depth: '8',
    });
    expect(headers).not.toHaveProperty('FEN');
  });

  it('gives each verdict its glyph', () => {
    const pgn = gamePgn(
      game({
        humanColor: 'black',
        moves: ['e2e4', 'f7f6', 'd2d4', 'g7g5', 'b1c3', 'e7e5', 'g1f3', 'a7a6'],
        verdicts: [null, 'blunder', null, 'mistake', null, 'best', null, 'inaccuracy'],
      }),
      DATE,
    );
    expect(pgn).toContain('1. e4 f6 $4 2. d4 g5 $2 3. Nc3 e5 $1 4. Nf3 a6 $6 *');
    expect(replay(pgn).headers).toMatchObject({ White: 'Advanced', Black: 'You' });
  });

  it('starts from a FEN with black to move, numbering from it', () => {
    const startFen = '8/8/4k3/8/4P3/8/8/4K3 b - - 0 40';
    const moves = ['e6e5', 'e1e2'];
    const pgn = gamePgn(game({ startFen, moves }), DATE);
    expect(pgn).toContain('40... Ke5 41. Ke2 *');
    const { headers, fen } = replay(pgn);
    expect(headers).toMatchObject({ SetUp: '1', FEN: startFen });
    expect(fen).toBe(finalFen(startFen, moves));
  });

  it('names the strength: a level, or the limit', () => {
    const tags = (strength: object) => replay(gamePgn(game(strength), DATE)).headers;
    expect(tags({ level: 3 })).toMatchObject({ Level: '3' });
    expect(tags({ level: 3 })).not.toHaveProperty('Depth');
    expect(tags({ limit: { movetimeMs: 1500 } })).toMatchObject({ MoveTime: '1500' });
    expect(tags({ limit: { movetimeMs: 1500 } })).not.toHaveProperty('Depth');
  });

  it('ends with the result once the game has one', () => {
    const moves = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    const pgn = gamePgn(game({ moves, result: 'black' }), DATE);
    expect(replay(pgn).headers.Result).toBe('0-1');
    expect(pgn.trimEnd()).toMatch(/Qh4# 0-1$/);
    expect(gamePgn(game({ result: 'draw' }), DATE).trimEnd()).toMatch(/1\/2-1\/2$/);
  });
});
