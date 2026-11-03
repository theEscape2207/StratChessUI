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
  submitNewGame,
  tapSquare,
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

test('takes back the human move during a search, whose reply never lands', async ({
  page,
  hasTouch,
}) => {
  await openSettled(page);
  // The fake sleeps out a move time. A click waits for a disabled button, so one left to wait out
  // the search would land after the reply and return to this same position; hence its timeout.
  await page.getByRole('spinbutton').fill('3000');
  await submitNewGame(page);
  await expectYourMove(page);
  await playMove(page, 'e2e4', hasTouch);
  await expectThinking(page);

  await undo(page).click({ timeout: 1000 });
  await expectFen(page, START);
  await expectMoves(page, []);
  await expectYourMove(page);
  await expect(undo(page)).toBeDisabled();

  await playMove(page, 'd2d4', hasTouch);
  await expectThinking(page);
  await expectMoves(page, ['d4', 'a5']);
  await expectYourMove(page);
});

test('is disabled while the engine thinks before the human has moved', async ({ page }) => {
  const server = await scriptedServer(page);
  server.game({ humanColor: 'black', phase: 'thinking' });
  await expect(undo(page)).toBeDisabled();
});

test('sends one takeback until the server answers, with a game state or an error', async ({
  page,
  hasTouch,
}) => {
  const server = await scriptedServer(page);
  server.game(IN_PLAY);
  await expect(undo(page)).toBeEnabled();

  await undo(page).click();
  await expect(undo(page)).toBeDisabled();
  await expect.poll(() => server.takebacks.length).toBe(1);

  server.error('nothing to take back');
  await expect(undo(page)).toBeEnabled();

  await undo(page).click();
  await expect(undo(page)).toBeDisabled();
  await expect.poll(() => server.takebacks.length).toBe(2);
  // The board waits too: a move sent now would land on the rewound position.
  const selected = page.locator('cg-board square.selected:visible');
  await tapSquare(page, 'd2', hasTouch);
  await expect(selected).toHaveCount(0);

  server.game(IN_PLAY);
  await expect(undo(page)).toBeEnabled();
  await tapSquare(page, 'd2', hasTouch);
  await expect(selected).toHaveCount(1);
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
