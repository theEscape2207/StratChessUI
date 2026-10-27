import type { GameState } from '@stratchess-ui/shared';

export type GameOverText = { title: string; line: string };

type Ended = Pick<GameState, 'result' | 'termination' | 'reason' | 'humanColor' | 'engineName'>;

/**
 * The dialog's title, from the human's side, and the line under it in the StatusLine's words. A
 * game that ended with no result, such as by an engine failure, shows the server's reason.
 */
export function gameOverText(game: Ended): GameOverText {
  if (!game.result) return { title: 'Game stopped', line: game.reason ?? '' };
  if (game.result === 'draw') return { title: 'Draw', line: `½-½ · by ${game.termination}` };
  const score = game.result === 'white' ? '1-0' : '0-1';
  const title =
    game.result === game.humanColor ? `You beat ${game.engineName}` : `${game.engineName} wins`;
  return { title, line: `${score} · by ${game.termination}` };
}
