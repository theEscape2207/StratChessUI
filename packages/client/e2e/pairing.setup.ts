import { expect, test as setup } from '@playwright/test';
import { newGame, playAndAwaitReply } from './helpers.ts';

// Pairs once and saves the token for every other test (playwright.config.ts). They all share it,
// because a second token would be refused while the first one's game waits out its grace period.

setup('pairs, plays, and resumes the game after a reload', async ({ page }) => {
  // A revoked token, like any unknown one, sends the browser back to pairing.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('pairing-token', 'revoked');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/');
  const code = page.getByLabel('Pairing code from the host');
  await code.fill('999999');
  await page.getByRole('button', { name: 'Pair' }).click();
  await expect(page.getByTestId('notice')).toHaveText('wrong pairing code');
  await code.fill('000000');
  await page.getByRole('button', { name: 'Pair' }).click();

  await newGame(page);
  await playAndAwaitReply(page, 'e2e4', false);
  const fen = 'rnbqkbnr/1ppppppp/8/p7/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  await expect(page.getByTestId('fen')).toHaveText(fen);

  await page.reload();
  await expect(page.getByTestId('status')).toHaveText('your move');
  await expect(page.getByTestId('fen')).toHaveText(fen);
  await playAndAwaitReply(page, 'd2d4', false);

  await page.context().storageState({ path: 'test-results/paired.json' });
});
