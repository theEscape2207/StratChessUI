import { describe, expect, it } from 'vitest';
import {
  appendTranscript,
  MAX_FEN_LENGTH,
  parseClientMessage,
  TRANSCRIPT_LINES,
  type TranscriptLine,
} from './protocol.ts';

const newGame = (limit: unknown, humanColor: unknown = 'black') =>
  parseClientMessage(JSON.stringify({ type: 'new-game', humanColor, engineId: 'x', limit }));

describe('protocol', () => {
  it('accepts a new game with a depth or move-time limit inside the ranges', () => {
    expect(newGame({ depth: 12 })).toEqual({
      type: 'new-game',
      humanColor: 'black',
      engineId: 'x',
      limit: { depth: 12 },
    });
    expect(newGame({ movetimeMs: 100 })).toMatchObject({ limit: { movetimeMs: 100 } });
  });

  it('refuses limits outside the ranges, and unknown sides', () => {
    for (const limit of [{ depth: 0 }, { depth: 41 }, { depth: 2.5 }, { movetimeMs: 60_001 }, {}]) {
      expect(newGame(limit)).toBeUndefined();
    }
    expect(newGame({ depth: 5 }, 'red')).toBeUndefined();
  });

  it('passes a start FEN on for the server to check, refusing one far too long to be a FEN', () => {
    const request = (fen: unknown) =>
      parseClientMessage(
        JSON.stringify({
          type: 'new-game',
          humanColor: 'white',
          engineId: 'x',
          limit: { depth: 1 },
          fen,
        }),
      );
    expect(request('anything')).toMatchObject({ fen: 'anything' });
    expect(request('x'.repeat(MAX_FEN_LENGTH))).toMatchObject({ fen: 'x'.repeat(MAX_FEN_LENGTH) });
    expect(request('x'.repeat(MAX_FEN_LENGTH + 1))).toBeUndefined();
    expect(request(42)).toBeUndefined();
  });

  it('keeps the newest lines of a transcript', () => {
    const line = (i: number): TranscriptLine => ({ dir: 'received', text: `${i}` });
    const lines = Array.from({ length: TRANSCRIPT_LINES - 1 }, (_, i) => line(i));
    const appended = appendTranscript(lines, [line(-1), line(-2)]);
    expect(appended).toHaveLength(TRANSCRIPT_LINES);
    expect(appended[0]).toEqual(line(1));
    expect(appended.slice(-2)).toEqual([line(-1), line(-2)]);
  });
});
