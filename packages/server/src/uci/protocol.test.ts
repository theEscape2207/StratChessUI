import { describe, expect, it } from 'vitest';
import {
  goCommand,
  parseBestMove,
  parseInfo,
  parseOption,
  positionCommand,
  setOptionCommand,
} from './protocol.ts';

describe('UCI protocol', () => {
  it('parses StratChess option lines', () => {
    expect(parseOption('option name Hash type spin default 192 min 1 max 1536')).toEqual({
      name: 'Hash',
      type: 'spin',
      default: '192',
      min: 1,
      max: 1536,
      vars: [],
    });
    expect(parseOption('option name SingularExtensions type check default true')).toMatchObject({
      type: 'check',
      default: 'true',
    });
    expect(
      parseOption('option name Style type combo default Normal var Solid var Normal'),
    ).toMatchObject({
      vars: ['Solid', 'Normal'],
    });
    expect(parseOption('option name Clear Hash type button')).toMatchObject({
      name: 'Clear Hash',
      type: 'button',
    });
  });

  it('parses info lines, including fields StratChess does not send yet', () => {
    expect(
      parseInfo('info depth 5 score cp 23 nodes 9422 hashfull 0 time 3 pv b1c3 b8c6 f1c4'),
    ).toEqual({
      depth: 5,
      score: { cp: 23 },
      nodes: 9422,
      hashfull: 0,
      timeMs: 3,
      pv: ['b1c3', 'b8c6', 'f1c4'],
    });
    expect(
      parseInfo('info depth 20 seldepth 31 score mate -3 lowerbound nps 900000 pv e2e4'),
    ).toMatchObject({
      seldepth: 31,
      score: { mate: -3 },
      bound: 'lower',
      nps: 900000,
    });
    expect(parseInfo('info string treenodes main 7411 qs 2011')).toBeUndefined();
  });

  it('parses bestmove', () => {
    expect(parseBestMove('bestmove e7e5')).toBe('e7e5');
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('info depth 1')).toBeUndefined();
  });

  it('builds commands and refuses anything that could inject a second command', () => {
    expect(positionCommand('8/8/8/8/8/8/8/K1k5 w - - 0 1', ['a1a2'])).toBe(
      'position fen 8/8/8/8/8/8/8/K1k5 w - - 0 1 moves a1a2',
    );
    expect(() => positionCommand('x\r\nquit', [])).toThrow('line break');
    expect(() => positionCommand('x', ['e7e8k'])).toThrow('not a UCI move');
    expect(() => setOptionCommand('Hash', '1\nquit')).toThrow('line break');
    expect(goCommand({ movetimeMs: 500 })).toBe('go movetime 500');
    expect(() => goCommand({ depth: 0 })).toThrow('depth must be >= 1');
  });
});
