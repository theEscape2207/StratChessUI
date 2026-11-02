import { expect, test } from '@playwright/test';
import { expectFen, expectMoves, expectYourMove, newGame, playAndAwaitReply } from './helpers.ts';

test('pairs, plays, and resumes the game after a reload', async ({ page }) => {
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
  await expectFen(page, fen);
  await expectMoves(page, ['e4', 'a5']);

  await page.reload();
  await expectYourMove(page);
  await expectFen(page, fen);
  await expectMoves(page, ['e4', 'a5']);
  await playAndAwaitReply(page, 'd2d4', false);
});

for (const [name, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test.describe(name, () => {
    test.use({ viewport });

    test('keeps the card in a centred column with the notice inside', async ({ page }) => {
      await page.goto('/');
      await page.getByLabel('Pairing code from the host').fill('999999');
      await page.getByRole('button', { name: 'Pair' }).click();

      const card = page.locator('.pair-card');
      await expect(card.getByTestId('notice')).toHaveText('wrong pairing code');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const box = await card.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(390);
      expect(box!.x + box!.width / 2).toBeCloseTo(viewport.width / 2, 0);
    });
  });
}
