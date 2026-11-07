import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  expectYourMove,
  openSettled,
  playAndAwaitReply,
  showNewGameForm,
  submitNewGame,
} from './helpers.ts';

// The servers offer the fake, then a fake that plays levels (main.ts).
const engine = (page: Page) => page.getByRole('combobox', { name: 'Engine' });
const limit = (page: Page) => page.getByRole('combobox', { name: 'Limit' });
const level = (page: Page) => page.getByRole('combobox', { name: /^Level/ });

test('plays a level against a profile with levels, and offers none without', async ({
  page,
  hasTouch,
}) => {
  await openSettled(page);
  await expect(limit(page).locator('option', { hasText: 'Level' })).toHaveCount(0);

  await engine(page).selectOption('fake-play');
  await expect(limit(page)).toHaveValue('level');
  await expect(level(page).locator('option')).toHaveText(['1', '2', '3', '4', '5']);
  await level(page).selectOption('3');
  await page.getByLabel('white', { exact: true }).check();
  await submitNewGame(page);

  await expectYourMove(page);
  await expect(page.getByTestId('strip-engine').locator('.strip-name')).toHaveText(/ level 3$/);
  await playAndAwaitReply(page, 'e2e4', hasTouch);

  await showNewGameForm(page);
  await engine(page).selectOption('fake');
  await expect(limit(page)).toHaveValue('movetimeMs');
});
