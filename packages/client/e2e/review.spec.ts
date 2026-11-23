import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  currentFen,
  expectFen,
  expectYourMove,
  MATE_IN_ONE,
  newGameFromFen,
  openSettled,
  playAndAwaitReply,
  scriptedServer,
  START,
  submitNewGame,
  tapSquare,
} from './helpers.ts';

const AFTER_H3 = '6k1/5ppp/8/8/8/7P/r4PP1/1R4K1 b - - 0 1';

const step = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const moveButton = (page: Page, san: string) =>
  page.getByTestId('moves').getByRole('button', { name: san });
const boardBadge = (page: Page) => page.getByTestId('board-badge');
const feedback = (page: Page) => page.getByTestId('move-feedback');

test('steps back to a blunder, with its badge and feedback on a locked board', async ({
  page,
  hasTouch,
}) => {
  await openSettled(page);
  await newGameFromFen(page, MATE_IN_ONE, true);
  await playAndAwaitReply(page, 'h2h3', hasTouch);
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Review game' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // On the engine's last move: no feedback or badge of its own.
  const final = await currentFen(page);
  await expect(step(page, 'Last move')).toBeDisabled();
  await expect(feedback(page)).toHaveCount(0);
  await expect(boardBadge(page)).toHaveCount(0);

  await step(page, 'Previous move').click();
  await expectFen(page, AFTER_H3);
  await expect(boardBadge(page)).toHaveAttribute('data-square', 'h3');
  await expect(boardBadge(page).getByRole('img', { name: 'blunder' })).toHaveText('??');
  await expect(page.getByTestId('feedback-played')).toContainText('h3 is a blunder');
  await expect(page.getByTestId('moves').locator('[aria-current]')).toContainText('h3');

  await moveButton(page, 'Ra1').click();
  await expectFen(page, final!);
  await expect(feedback(page)).toHaveCount(0);

  // The start position, where white could mate: the board must not let the rook move.
  await step(page, 'First move').click();
  await expectFen(page, MATE_IN_ONE);
  await expect(boardBadge(page)).toHaveCount(0);
  await tapSquare(page, 'b1', hasTouch);
  // Chessground draws a selection on its next frame, and keeps spare squares hidden.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  await expect(page.locator('cg-board square.move-dest').filter({ visible: true })).toHaveCount(0);

  // A game already over when the page loads opens in review, on the last move.
  await page.reload();
  await expect(step(page, 'Last move')).toBeDisabled();
  await expectFen(page, final!);
  await step(page, 'Previous move').click();
  await expectFen(page, AFTER_H3);

  await page.getByTestId('show-new-game').click();
  await page.getByLabel('Start position').fill('');
  await submitNewGame(page);
  await expectFen(page, START);
  await expectYourMove(page);
});

test('the move list keeps the selected move in view, and the page stays put', async ({ page }) => {
  const server = await scriptedServer(page);
  // Knights out and back, fifteen times: more rows than the list has room for.
  const moves = Array.from({ length: 15 }, () => ['g1f3', 'g8f6', 'f3g1', 'f6g8']).flat();
  server.game({
    humanColor: 'white',
    moves,
    lastMove: 'f6g8',
    fen: START,
    phase: 'over',
    result: 'draw',
    termination: 'threefold repetition',
  });
  const list = page.getByTestId('moves');
  const current = list.locator('[aria-current]');
  const shown = () =>
    current.evaluate((item) => {
      const box = item.closest('ol')!.getBoundingClientRect();
      const { top, bottom } = item.getBoundingClientRect();
      return top >= box.top - 1 && bottom <= box.bottom + 1;
    });
  await expect(step(page, 'Last move')).toBeDisabled();
  await expect(current).toHaveText('Ng8');
  expect(await shown()).toBe(true);

  const scrollY = await page.evaluate(() => window.scrollY);
  await step(page, 'First move').click();
  await step(page, 'Next move').click();
  await expect(current).toHaveText('Nf3');
  await expect.poll(shown).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test("review shows every verdict, and the strips' captures follow the board", async ({ page }) => {
  const server = await scriptedServer(page);
  // 1. e4 d5 2. exd5, and white resigned.
  server.game({
    humanColor: 'white',
    moves: ['e2e4', 'd7d5', 'e4d5'],
    verdicts: ['best', null, 'excellent'],
    fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
    lastMove: 'e4d5',
    phase: 'over',
    result: 'black',
    termination: 'resignation',
  });
  await expect(step(page, 'Last move')).toBeDisabled();
  const captures = page.getByTestId('strip-human').getByTestId('captures');
  await expect(captures.getByRole('img')).toHaveCount(1);
  // Every verdict shows in review, best and excellent too.
  await expect(page.getByTestId('moves').getByTestId('quality-badge')).toHaveCount(2);

  await step(page, 'Previous move').click();
  await expect(captures.getByRole('img')).toHaveCount(0);
  await expect(page.getByTestId('moves').locator('[aria-current]')).toHaveText('d5');
  await step(page, 'First move').click();
  await expectFen(page, START);
  await expect(page.getByTestId('moves').locator('[aria-current]')).toHaveCount(0);
  await expect(step(page, 'Previous move')).toBeDisabled();
});
