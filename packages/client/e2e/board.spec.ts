import { expect, test, type Page } from '@playwright/test';
import {
  newGame,
  openSettled,
  playAndAwaitReply,
  playMove,
  START,
  tapSquare,
  THINKING,
} from './helpers.ts';

// Every test resumes the game the previous one left (see pairing.setup.ts); New game replaces it.

test.beforeEach(async ({ page }) => openSettled(page));

test('plays white against the engine, with the board locked while it thinks', async ({
  page,
  hasTouch,
}) => {
  // The move-time default: the fake sleeps it out, which leaves time to try the locked board.
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
  await newGame(page, 'black');
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
  await newGame(page);
  await playMove(page, 'e2e5', hasTouch);
  await expect(page.getByTestId('fen')).toHaveText(START);
});

/** Plays each move and waits for the engine's reply, as `side`. */
async function playLine(page: Page, moves: string[], touch: boolean, side = 'white') {
  for (const move of moves) await playAndAwaitReply(page, move, touch, side);
}

test('checkmate ends the game and locks the board', async ({ page, hasTouch }) => {
  await newGame(page);
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
  await newGame(page);
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
    await newGame(page, 'black');
    // The fake opens b1a3, then shuffles its rook between a1 and b1.
    await playLine(page, [...moves], hasTouch, 'black');
    await expect(page.getByTestId('fen')).toHaveText(fen);
  });
}

for (const side of ['white', 'black'] as const) {
  test(`coordinates sit inside their edge squares, ${side} at the bottom`, async ({ page }) => {
    await newGame(page, side);
    // Chessground snaps cg-board to whole device pixels, so it can be smaller than the wrapper.
    const board = (await page.locator('cg-board').boundingBox())!;
    const square = board.width / 8;
    const labels = await page.locator('coords.files coord, coords.ranks coord').evaluateAll((els) =>
      els.map((el) => {
        // The glyphs, not the label's box: a box can fit its square while its text hangs over.
        const range = document.createRange();
        range.selectNodeContents(el);
        return { text: el.textContent!, box: range.getBoundingClientRect().toJSON() };
      }),
    );
    expect(labels).toHaveLength(16);
    for (const { text, box } of labels) {
      // Seen from white, file a is the left column and rank 8 the top row; black mirrors both.
      const isFile = /[a-h]/i.test(text);
      const index = isFile ? text.toLowerCase().charCodeAt(0) - 97 : 8 - Number(text);
      const slot = side === 'white' ? index : 7 - index;
      const [col, row] = isFile ? [slot, 7] : [0, slot];
      const sq = { left: board.x + col * square, top: board.y + row * square };
      expect.soft(box.left, text).toBeGreaterThanOrEqual(sq.left - 0.5);
      expect.soft(box.right, text).toBeLessThanOrEqual(sq.left + square + 0.5);
      expect.soft(box.top, text).toBeGreaterThanOrEqual(sq.top - 0.5);
      expect.soft(box.bottom, text).toBeLessThanOrEqual(sq.top + square + 0.5);
    }
  });
}
