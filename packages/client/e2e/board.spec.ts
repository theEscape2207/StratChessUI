import { expect, test, type Page } from '@playwright/test';

// The server runs the fake engine, which answers its first legal move (see playwright.config.ts).
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const THINKING = 'StratChess (fake) thinking';

/** Clicks (or taps, on touch devices) a square on the board, seen from `bottom`'s side. */
async function tapSquare(page: Page, sq: string, touch: boolean, bottom = 'white') {
  const board = page.getByTestId('board');
  // Pressing New game scrolls the form into view, which can push the top ranks off screen.
  // Chessground caches the board's position until it sees the scroll event, so wait for it.
  await board.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const before = scrollY;
        el.scrollIntoView({ block: 'nearest' });
        if (scrollY === before) resolve();
        else addEventListener('scroll', () => resolve(), { once: true });
      }),
  );
  const box = (await board.boundingBox())!;
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

/** Plays each move and waits for the engine's reply, as `side`. */
async function playLine(page: Page, moves: string[], touch: boolean, side = 'white') {
  for (const move of moves) {
    await playMove(page, move, touch, side);
    await expect(page.getByTestId('status')).toHaveText(THINKING);
    await expect(page.getByTestId('status')).toHaveText('your move');
  }
}

test('checkmate ends the game and locks the board', async ({ page, hasTouch }) => {
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByTestId('status')).toHaveText('your move');
  // The fake's first legal move is always an a-pawn push, which never defends f7.
  await playLine(page, ['e2e4', 'f1c4', 'd1h5'], hasTouch);
  await playMove(page, 'h5f7', hasTouch);
  await expect(page.getByTestId('status')).toHaveText('game over: white wins by checkmate');

  await tapSquare(page, 'e1', hasTouch);
  await expect(page.locator('cg-board square.selected:visible')).toHaveCount(0);
});

test('en passant, then promotion to a knight after a cancelled choice', async ({
  page,
  hasTouch,
}) => {
  await page.getByRole('button', { name: 'New game' }).click();
  await expect(page.getByTestId('status')).toHaveText('your move');
  // Black answers a5, a4, a3, then b5 beside the pawn on c5.
  await playLine(page, ['c2c4', 'c4c5', 'b2b3', 'g1f3'], hasTouch);
  await expect(page.getByTestId('fen')).toHaveText(
    'rnbqkbnr/2pppppp/8/1pP5/8/pP3N2/P2PPPPP/RNBQKB1R w KQkq b6 0 5',
  );
  await playLine(page, ['c5b6', 'b6b7'], hasTouch);
  await expect(page.getByTestId('fen')).toHaveText(
    'rnbqkbnr/1P1ppppp/8/8/2p5/pP3N2/P2PPPPP/RNBQKB1R w KQkq - 0 7',
  );

  const knight = page.getByRole('button', { name: 'Promote to knight' });
  await playMove(page, 'b7a8', hasTouch);
  await expect(knight).toBeVisible();
  await tapSquare(page, 'h8', hasTouch); // outside the pieces
  await expect(knight).toBeHidden();
  await expect(page.locator('cg-board piece.pawn.white')).toHaveCount(8);

  await playMove(page, 'b7a8', hasTouch);
  await (hasTouch ? knight.tap() : knight.click());
  await expect(page.getByTestId('status')).toHaveText('your move');
  await expect(page.getByTestId('fen')).toHaveText(
    'Nnbqkbnr/3ppppp/8/8/8/pp3N2/P2PPPPP/RNBQKB1R w KQk - 0 8',
  );
});

for (const [side, moves, fen] of [
  [
    'kingside',
    ['e7e5', 'g8f6', 'f8c5', 'e8g8'],
    'rnbq1rk1/pppp1ppp/5n2/2b1p3/8/N7/PPPPPPPP/R1BQKBNR b K - 7 5',
  ],
  [
    'queenside',
    ['d7d5', 'b8c6', 'c8e6', 'd8d7', 'e8c8'],
    '2kr1bnr/pppqpppp/2n1b3/3p4/8/N7/PPPPPPPP/1RBQKBNR b K - 9 6',
  ],
] as const) {
  test(`castles ${side} as black`, async ({ page, hasTouch }) => {
    await page.getByLabel('black').check();
    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.getByTestId('status')).toHaveText('your move');
    // The fake opens b1a3, then shuffles its rook between a1 and b1.
    await playLine(page, [...moves], hasTouch, 'black');
    await expect(page.getByTestId('fen')).toHaveText(fen);
  });
}
