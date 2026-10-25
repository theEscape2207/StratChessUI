import { expect, test, type Page } from '@playwright/test';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Click-click (or tap-tap on touch devices) move on the board, white at the bottom. */
async function playMove(page: Page, uci: string, touch: boolean) {
  const box = (await page.getByTestId('board').boundingBox())!;
  const square = box.width / 8;
  for (const sq of [uci.slice(0, 2), uci.slice(2, 4)]) {
    const x = box.x + (sq.charCodeAt(0) - 'a'.charCodeAt(0) + 0.5) * square;
    const y = box.y + (8 - Number(sq[1]) + 0.5) * square;
    if (touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('connected');
});

test('a legal move round-trips through the server', async ({ page, hasTouch }) => {
  await playMove(page, 'e2e4', hasTouch);
  await expect(page.getByTestId('fen')).toHaveText(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  );
});

test('the board refuses an illegal move', async ({ page, hasTouch }) => {
  await playMove(page, 'e2e5', hasTouch);
  await expect(page.getByTestId('fen')).toHaveText(START);
});
