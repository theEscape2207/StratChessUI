import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { newGame, openSettled, playAndAwaitReply } from './helpers.ts';

const DESKTOP = 960;

const form = (page: Page) => page.locator('form.new-game');
const reveal = (page: Page) => page.getByTestId('show-new-game');

async function box(locator: Locator) {
  return (await locator.boundingBox())!;
}

test('before the first game the sidebar shows the new-game form', async ({ page }) => {
  // Each test server keeps its last game, so this one stands in for a host that has none.
  await page.routeWebSocket(/\/ws/, (ws) => {
    ws.send(JSON.stringify({ type: 'hello', engines: [{ id: 'fake', name: 'Fake' }] }));
  });
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('choose a side and start a game');
  await expect(form(page)).toBeVisible();
  await expect(reveal(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeHidden();
});

test('during play the form hides behind New game, and comes back after game over', async ({
  page,
  hasTouch,
}) => {
  await openSettled(page);
  await newGame(page);
  await expect(form(page)).toBeHidden();

  await reveal(page).click();
  await expect(form(page)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(form(page)).toBeHidden();
  await expect(page.getByTestId('status')).toHaveText('your move');

  // Fool's mate against the fake's a-pawn pushes takes too long; a mated start position ends it.
  await reveal(page).click();
  await page.getByLabel('Start position').fill('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 30');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByTestId('status')).toHaveText('game over: white wins by checkmate');
  await expect(form(page)).toBeVisible();
  await expect(reveal(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeHidden();

  await page.getByLabel('Start position').fill('');
  await newGame(page);
  await playAndAwaitReply(page, 'e2e4', hasTouch);
  await expect(form(page)).toBeHidden();
});

test("the sidebar follows the design's order and columns", async ({ page, hasTouch }) => {
  await openSettled(page);
  await newGame(page);
  await playAndAwaitReply(page, 'e2e4', hasTouch);

  const sidebar = page.getByRole('complementary', { name: 'Game' });
  const sections = [
    page.getByTestId('search'),
    page.getByTestId('moves'),
    reveal(page),
    page.getByTestId('transcript'),
    page.getByRole('button', { name: 'Copy FEN' }),
  ];
  let above = 0;
  for (const section of sections) {
    const { y } = await box(section);
    expect(y).toBeGreaterThan(above);
    above = y;
  }
  // The current move sits on a chip; the FEN is the line under the board.
  await expect(page.getByTestId('moves').locator('[aria-current="true"]')).toHaveText('a5');
  const board = await box(page.getByTestId('board'));
  const fen = await box(page.getByTestId('fen'));
  expect(fen.y).toBeGreaterThan(board.y + board.height);

  const side = await box(sidebar);
  if (page.viewportSize()!.width >= DESKTOP) {
    // GameScreen: the sidebar beside the board, both from the top, with its title bar.
    expect(side.x).toBeGreaterThan(board.x + board.width);
    expect(side.y).toBe(board.y);
    await expect(sidebar.getByRole('heading')).toHaveText('Play StratChess (fake)');
  } else {
    // GameScreenPhone: the board edge to edge, the sidebar under it and the FEN.
    expect(board.width).toBe(page.viewportSize()!.width);
    expect(side.y).toBeGreaterThan(fen.y + fen.height);
    await expect(sidebar.getByRole('heading')).toBeHidden();
  }
});
