import { expect, test, type Page } from '@playwright/test';

// The server runs the fake engine, which answers its first legal move (see playwright.config.ts).
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const THINKING = 'StratChess (fake) thinking';

/** Clicks (or taps, on touch devices) a square on the board, seen from `bottom`'s side. */
async function tapSquare(page: Page, sq: string, touch: boolean, bottom = 'white') {
  const box = (await page.getByTestId('board').boundingBox())!;
  const square = box.width / 8;
  let file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
  let rank = Number(sq[1]) - 1;
  if (bottom === 'black') [file, rank] = [7 - file, 7 - rank];
  const x = box.x + (file + 0.5) * square;
  const y = box.y + (7 - rank + 0.5) * square;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function playMove(page: Page, uci: string, touch: boolean, bottom = 'white') {
  await tapSquare(page, uci.slice(0, 2), touch, bottom);
  await tapSquare(page, uci.slice(2, 4), touch, bottom);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveText('choose a side and start a game');
});

test('plays white against the engine, with the board locked while it thinks', async ({
  page,
  hasTouch,
}) => {
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByTestId('status')).toHaveText('your move');

  await playMove(page, 'e2e4', hasTouch);
  await expect(page.getByTestId('status')).toHaveText(THINKING);
  await tapSquare(page, 'd2', hasTouch);
  // Chessground hides squares it no longer needs rather than removing them.
  await expect(page.locator('cg-board square.selected:visible')).toHaveCount(0);
  await expect(page.getByTestId('status')).toHaveText('your move');
  await expect(page.getByTestId('fen')).toHaveText(
    'rnbqkbnr/1ppppppp/8/p7/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  );

  await playMove(page, 'd2d4', hasTouch);
  await expect(page.getByTestId('status')).toHaveText('your move');
  await expect(page.getByTestId('fen')).toHaveText(
    'rnbqkbnr/1ppppppp/8/8/p2PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3',
  );
});

test('plays black: the engine opens and the board is flipped', async ({ page, hasTouch }) => {
  await page.getByLabel('black').check();
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByTestId('status')).toHaveText('your move');
  await expect(page.getByTestId('fen')).toHaveText(
    'rnbqkbnr/pppppppp/8/8/8/N7/PPPPPPPP/R1BQKBNR b KQkq - 1 1',
  );

  await playMove(page, 'e7e5', hasTouch, 'black');
  await expect(page.getByTestId('status')).toHaveText('your move');
  await expect(page.getByTestId('fen')).toHaveText(
    'rnbqkbnr/pppp1ppp/8/4p3/8/N7/PPPPPPPP/1RBQKBNR b Kkq - 1 2',
  );
});

test('the board refuses an illegal move', async ({ page, hasTouch }) => {
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByTestId('status')).toHaveText('your move');
  await playMove(page, 'e2e5', hasTouch);
  await expect(page.getByTestId('fen')).toHaveText(START);
});
