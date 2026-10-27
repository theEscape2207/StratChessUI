import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  newGame,
  openSettled,
  playAndAwaitReply,
  playMove,
  showNewGameForm,
  submitNewGame,
} from './helpers.ts';

test.beforeEach(async ({ page }) => openSettled(page));

const MATED = 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 30';
// The fake engine crashes on its first search from here (fake-engine.ts).
const CRASH = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';

/** Starts a game from `fen` as the side to move, which the form picks, at depth `depth`. */
async function newGameFrom(page: Page, fen: string, depth = 8) {
  await showNewGameForm(page);
  await page.getByLabel('Start position').fill(fen);
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await page.getByRole('spinbutton', { name: 'Depth (plies)' }).fill(String(depth));
  await submitNewGame(page);
}

async function expectDialog(page: Page, title: string, line: string | RegExp) {
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading')).toHaveText(title);
  await expect(dialog.getByTestId('game-over-line')).toHaveText(line);
}

test('opens when the human mates, and × leaves the final position and the form', async ({
  page,
  hasTouch,
}) => {
  await newGame(page);
  // The fake's first legal move is always an a-pawn push, which never defends f7.
  for (const move of ['e2e4', 'f1c4', 'd1h5']) await playAndAwaitReply(page, move, hasTouch);
  await playMove(page, 'h5f7', hasTouch);
  await expectDialog(page, 'You beat StratChess (fake)', '1-0 · by checkmate');
  const fen = await page.getByTestId('fen').textContent();

  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('fen')).toHaveText(fen!);
  await expect(page.locator('form.new-game')).toBeVisible();
});

test("stops with the server's reason when the engine fails, and a scrim tap closes", async ({
  page,
  hasTouch,
}) => {
  await newGameFrom(page, CRASH);
  await expect(page.getByTestId('status')).toHaveText('your move');
  await playMove(page, 'e2e4', hasTouch);
  await expectDialog(page, 'Game stopped', /^StratChess \(fake\) failed: /);
  const line = await page.getByTestId('game-over-line').textContent();
  await expect(page.getByTestId('status')).toHaveText(`game over: ${line}`);

  const scrim = page.getByTestId('game-over-scrim');
  if (hasTouch) await scrim.tap({ position: { x: 4, y: 4 } });
  else await scrim.click({ position: { x: 4, y: 4 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('does not open again when a finished game is reloaded', async ({ page }) => {
  await newGameFrom(page, MATED);
  await expectDialog(page, 'StratChess (fake) wins', '1-0 · by checkmate');

  await page.reload();
  await expect(page.getByTestId('status')).toHaveText('game over: white wins by checkmate');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('New game goes to the form, keeping the settings just played', async ({ page }) => {
  await newGameFrom(page, MATED, 5);
  await page.getByRole('dialog').getByRole('button', { name: 'New game' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  const form = page.locator('form.new-game');
  await expect(form.getByRole('button', { name: 'New game' })).toBeFocused();
  await expect(form.getByLabel('black', { exact: true })).toBeChecked();
  await expect(form.getByRole('combobox', { name: 'Limit' })).toHaveValue('depth');
  await expect(form.getByRole('spinbutton', { name: 'Depth (plies)' })).toHaveValue('5');
  await expect(form.getByLabel('Start position')).toHaveValue(MATED);
});
