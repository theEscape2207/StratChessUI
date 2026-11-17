import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  expectFen,
  expectYourMove,
  moreSummary as summary,
  openSettled,
  playAndAwaitReply,
  submitNewGame,
} from './helpers.ts';

test.use({ more: 'untouched' });
test.beforeEach(async ({ page }) => openSettled(page));

const searchLine = (page: Page) => page.getByLabel('Show engine search line');
const startPosition = (page: Page) => page.getByLabel('Start position');

function technical(page: Page) {
  return [
    page.getByLabel('Move Feedback'),
    searchLine(page),
    page.getByRole('combobox', { name: 'Limit' }),
    startPosition(page),
    page.getByTestId('transcript'),
    page.getByRole('button', { name: 'Copy FEN' }),
    page.getByTestId('search'),
  ];
}

test('a level game starts and plays with the technical detail out of sight', async ({
  page,
  hasTouch,
}) => {
  await page.getByRole('combobox', { name: 'Engine' }).selectOption('fake-play');
  for (const item of technical(page)) await expect(item).toBeHidden();
  await submitNewGame(page);
  await expectYourMove(page);
  await playAndAwaitReply(page, 'e2e4', hasTouch);
  for (const item of technical(page)) await expect(item).toBeHidden();
});

test('the search line shows once asked for, and More stays as it was left', async ({
  page,
  hasTouch,
}) => {
  await summary(page).click();
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await searchLine(page).check();
  await submitNewGame(page);
  await expectYourMove(page);
  await playAndAwaitReply(page, 'e2e4', hasTouch);
  await expect(page.getByTestId('search')).toBeVisible();

  // The page keeps no search across a reload, so the engine has to report another.
  await page.reload();
  await expect(searchLine(page)).toBeVisible();
  await expect(searchLine(page)).toBeChecked();
  await playAndAwaitReply(page, 'd2d4', hasTouch);
  await expect(page.getByTestId('search')).toBeVisible();

  await searchLine(page).uncheck();
  await expect(page.getByTestId('search')).toBeHidden();
  await summary(page).click();
  await page.reload();
  await expectYourMove(page);
  await expect(searchLine(page)).toBeHidden();
  await expect(page.getByTestId('search')).toBeHidden();
});

test('starts from a FEN through More, which a refused FEN reopens', async ({ page }) => {
  await summary(page).click();
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await startPosition(page).fill('4k3/8/8/8/8/8/8/4RK2 w - - 0 1');
  await summary(page).click();
  await expect(startPosition(page)).toBeHidden();

  await submitNewGame(page);
  await expect(page.getByTestId('fen-error')).toBeVisible();

  const fen = '4k3/8/8/8/4P3/8/8/4K3 w - - 0 40';
  await startPosition(page).fill(fen);
  await submitNewGame(page);
  await expectFen(page, fen);
  await expectYourMove(page);
});
