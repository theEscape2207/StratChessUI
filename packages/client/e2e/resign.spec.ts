import type { Page } from '@playwright/test';
import type { GameState } from '@stratchess-ui/shared';
import { expect, test } from './fixtures.ts';
import {
  expectMoves,
  expectThinking,
  expectYourMove,
  newGame,
  openSettled,
  playAndAwaitReply,
  playMove,
  scriptedServer,
  submitNewGame,
} from './helpers.ts';

const IN_PLAY: Partial<GameState> = { humanColor: 'white', phase: 'human' };

const resign = (page: Page) => page.getByRole('button', { name: 'Resign' });
const keepPlaying = (page: Page) => page.getByRole('button', { name: 'Keep playing' });

async function expectResigned(page: Page, title: string, line: string) {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toHaveText(title);
  await expect(dialog.getByTestId('game-over-line')).toHaveText(line);
}

test('asks once, then ends the game as a loss', async ({ page, hasTouch }) => {
  await openSettled(page);
  await newGame(page);
  await playAndAwaitReply(page, 'e2e4', hasTouch);

  await resign(page).click();
  await expect(page.getByText('Resign this game?')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await resign(page).click();

  await expectResigned(page, 'StratChess (fake) wins', '0-1 · you resigned');
  await expect(resign(page)).toBeDisabled();
});

test('from black, gives white the game', async ({ page }) => {
  await openSettled(page);
  await newGame(page, 'black');
  await resign(page).click();
  await resign(page).click();
  await expectResigned(page, 'StratChess (fake) wins', '1-0 · you resigned');
});

test('Keep playing brings the row back and the game plays on', async ({ page, hasTouch }) => {
  await openSettled(page);
  await newGame(page);

  await resign(page).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
  await keepPlaying(page).click();
  await expect(page.getByText('Resign this game?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();

  await playAndAwaitReply(page, 'e2e4', hasTouch);
  await expectMoves(page, ['e4', 'a5']);
});

test('a double tap on Resign sends nothing', async ({ page }) => {
  const server = await scriptedServer(page);
  server.game(IN_PLAY);
  const tapped = (await resign(page).boundingBox())!;
  await resign(page).dblclick();
  const confirm = (await resign(page).boundingBox())!;
  expect(confirm.x).toBeGreaterThanOrEqual(tapped.x + tapped.width);
  expect(server.resigns).toEqual([]);
});

test('during a search, whose reply never lands', async ({ page, hasTouch }) => {
  await openSettled(page);
  // The fake sleeps out a move time.
  await page.getByRole('spinbutton').fill('3000');
  await submitNewGame(page);
  await expectYourMove(page);
  await playMove(page, 'e2e4', hasTouch);
  await expectThinking(page);

  await resign(page).click();
  await resign(page).click();
  await expectResigned(page, 'StratChess (fake) wins', '0-1 · you resigned');
  await expectMoves(page, ['e4']);
});

test('is disabled until the game has started', async ({ page }) => {
  const server = await scriptedServer(page);
  server.game({ phase: 'starting' });
  await expect(resign(page)).toBeDisabled();
});

test('a game ending while it asks closes the prompt, for good', async ({ page }) => {
  const server = await scriptedServer(page);
  server.game(IN_PLAY);
  await resign(page).click();
  await expect(keepPlaying(page)).toBeVisible();

  server.game({ ...IN_PLAY, phase: 'over', result: 'black', termination: 'checkmate' });
  await expect(keepPlaying(page)).toHaveCount(0);
  server.game(IN_PLAY);
  await expect(resign(page)).toBeEnabled();
  await expect(keepPlaying(page)).toHaveCount(0);
});
