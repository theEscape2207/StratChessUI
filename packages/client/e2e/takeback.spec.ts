import type { Page } from '@playwright/test';
import type { GameState } from '@stratchess-ui/shared';
import { expect, test } from './fixtures.ts';
import {
  expectFen,
  expectMoves,
  expectThinking,
  expectYourMove,
  newGame,
  openSettled,
  playAndAwaitReply,
  playMove,
  scriptedServer,
  START,
} from './helpers.ts';

const AFTER_REPLY = 'rnbqkbnr/1ppppppp/8/p7/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const IN_PLAY: Partial<GameState> = {
  humanColor: 'white',
  phase: 'human',
  fen: AFTER_REPLY,
  moves: ['e2e4', 'a7a5'],
  lastMove: 'a7a5',
};

const undo = (page: Page) => page.getByRole('button', { name: 'Undo' });

test('takes the human move and the reply back, and the game plays on', async ({
  page,
  hasTouch,
}) => {
  await openSettled(page);
  await newGame(page);
  await expect(undo(page)).toBeDisabled();

  await playAndAwaitReply(page, 'e2e4', hasTouch);
  const lastMove = page.locator('cg-board square.last-move:visible');
  await expect(lastMove).toHaveCount(2);
  await undo(page).click();
  await expectFen(page, START);
  await expectMoves(page, []);
  await expect(lastMove).toHaveCount(0);
  await expect(undo(page)).toBeDisabled();

  await playAndAwaitReply(page, 'd2d4', hasTouch);
  await expectMoves(page, ['d4', 'a5']);
  await expect(undo(page)).toBeEnabled();
});

test('an engine that moved first keeps its opening move', async ({ page, hasTouch }) => {
  await openSettled(page);
  await newGame(page, 'black');
  await expect(undo(page)).toBeDisabled();

  await playAndAwaitReply(page, 'e7e5', hasTouch, 'black');
  await undo(page).click();
  await expectMoves(page, ['Na3']);
  await expect(undo(page)).toBeDisabled();
});

test('is disabled while the engine thinks', async ({ page, hasTouch }) => {
  await openSettled(page);
  // The move-time default: the fake sleeps it out.
  await page.getByRole('button', { name: 'New game' }).click();
  await expectYourMove(page);
  await playMove(page, 'e2e4', hasTouch);
  await expectThinking(page);
  await expect(undo(page)).toBeDisabled();
});

test('sends one takeback until the server answers, with a game state or an error', async ({
  page,
}) => {
  const server = await scriptedServer(page);
  server.game(IN_PLAY);
  await expect(undo(page)).toBeEnabled();

  await undo(page).click();
  await expect(undo(page)).toBeDisabled();
  expect(server.takebacks).toHaveLength(1);

  server.error('nothing to take back');
  await expect(undo(page)).toBeEnabled();

  await undo(page).click();
  await expect(undo(page)).toBeDisabled();
  server.game(IN_PLAY);
  await expect(undo(page)).toBeEnabled();
  expect(server.takebacks).toHaveLength(2);
});

test('is disabled once the game is over', async ({ page }) => {
  const server = await scriptedServer(page);
  server.game(IN_PLAY);
  await expect(undo(page)).toBeEnabled();
  server.game({ ...IN_PLAY, phase: 'over', reason: 'the engine failed' });
  await expect(undo(page)).toBeDisabled();
});

test('forgets what the engine said about the moves taken back', async ({ page }) => {
  const server = await scriptedServer(page);
  server.game({ ...IN_PLAY, phase: 'thinking' });
  server.search(AFTER_REPLY, { depth: 3, score: { cp: -320 } });
  await expect(page.getByTestId('search')).toBeVisible();
  server.game(IN_PLAY);
  await expect(page.getByTestId('search')).toBeVisible();
  await expect(page.getByTestId('eval-bar')).toHaveAttribute('aria-valuenow', '32');

  server.game({ humanColor: 'white', phase: 'human' });
  await expectFen(page, START);
  await expect(page.getByTestId('search')).toBeHidden();
  await expect(page.getByTestId('eval-bar')).toHaveAttribute('aria-valuenow', '50');
  await expect(page.getByTestId('eval-number')).toHaveCount(0);
});
