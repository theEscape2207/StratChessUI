import { describe, expect, it } from 'vitest';
import { START_FEN } from '@stratchess-ui/shared';
import { parseInfo } from '../uci/protocol.ts';
import { searchReport } from './search-report.ts';

const BLACK_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const report = (fen: string, line: string) => searchReport(fen, parseInfo(line)!);

describe('searchReport', () => {
  it('keeps the score and bound as they are when white is to move', () => {
    expect(report(START_FEN, 'info depth 9 score mate 3 lowerbound pv e2e4')).toEqual({
      depth: 9,
      score: { mate: 3 },
      bound: 'lower',
      pv: ['e4'],
    });
  });

  it('turns score and bound to white when black is to move', () => {
    expect(report(BLACK_TO_MOVE, 'info depth 9 score mate 3 lowerbound')).toMatchObject({
      score: { mate: -3 },
      bound: 'upper',
    });
    expect(report(BLACK_TO_MOVE, 'info depth 9 score cp -40 upperbound')).toMatchObject({
      score: { cp: 40 },
      bound: 'lower',
    });
  });

  it('cuts the PV at the first illegal move and drops malformed numbers', () => {
    expect(
      report(START_FEN, 'info depth x seldepth 12 nps 900 score cp 20 pv e2e4 e7e5 e1e3 g1f3'),
    ).toEqual({ seldepth: 12, nps: 900, score: { cp: 20 }, pv: ['e4', 'e5'] });
  });
});
