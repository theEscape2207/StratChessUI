import { describe, expect, it } from 'vitest';
import { gameOverText } from './gameover.ts';

describe('gameOverText', () => {
  const ended = { humanColor: 'black', engineName: 'StratChess' } as const;

  it.each([
    ['black', 'checkmate', 'You beat StratChess', '0-1 · by checkmate'],
    ['white', 'checkmate', 'StratChess wins', '1-0 · by checkmate'],
    ['draw', 'stalemate', 'Draw', '½-½ · by stalemate'],
    ['draw', 'threefold repetition', 'Draw', '½-½ · by threefold repetition'],
  ] as const)('%s by %s: %s, %s', (result, termination, title, line) => {
    expect(gameOverText({ ...ended, result, termination })).toEqual({ title, line });
  });

  it("stops with the server's reason when the game has no result", () => {
    const reason = 'StratChess failed: engine exited with code 3';
    expect(gameOverText({ ...ended, reason })).toEqual({ title: 'Game stopped', line: reason });
  });
});
