import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  expectFen,
  expectFenNotShown,
  expectMoves,
  expectThinking,
  expectYourMove,
  newGame,
  openSettled,
  playAndAwaitReply,
  playMove,
  showNewGameForm,
  START,
  tapSquare,
} from './helpers.ts';

// Each test resumes whatever game its server last held; New game replaces it.

test.beforeEach(async ({ page }) => openSettled(page));

test('plays white against the engine, with the board locked while it thinks', async ({
  page,
  hasTouch,
}) => {
  // The move-time default: the fake sleeps it out, which leaves time to try the locked board.
  await page.getByRole('button', { name: 'New game' }).click();
  await expectYourMove(page);

  await playMove(page, 'e2e4', hasTouch);
  await expectThinking(page);
  await tapSquare(page, 'd2', hasTouch);
  // Chessground hides squares it no longer needs rather than removing them.
  await expect(page.locator('cg-board square.selected:visible')).toHaveCount(0);
  await expectYourMove(page);
  await expectFen(page, 'rnbqkbnr/1ppppppp/8/p7/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');

  await playMove(page, 'd2d4', hasTouch);
  await expectYourMove(page);
  await expectFen(page, 'rnbqkbnr/1ppppppp/8/8/p2PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3');
});

test('highlights the legal moves of the selected piece', async ({ page, hasTouch }) => {
  // Chessground keeps each square's name on the element, as `cgKey`, and draws it by position alone.
  const highlighted = () =>
    page
      .locator('cg-board square.move-dest:visible')
      .evaluateAll((squares) =>
        squares.map((el) => (el as HTMLElement & { cgKey: string }).cgKey).sort(),
      );
  await page.getByRole('button', { name: 'New game' }).click();
  await expectYourMove(page);
  expect(await highlighted()).toEqual([]);

  await tapSquare(page, 'e2', hasTouch);
  await expect.poll(highlighted).toEqual(['e3', 'e4']);

  await tapSquare(page, 'b1', hasTouch);
  await expect.poll(highlighted).toEqual(['a3', 'c3']);
});

test("shows the engine's search while it thinks, and its last line after", async ({
  page,
  hasTouch,
}) => {
  // The move-time default: the fake reports its iterations at once, then sleeps out the time.
  await page.getByRole('button', { name: 'New game' }).click();
  await expectYourMove(page);
  await expect(page.getByTestId('search')).toBeHidden();

  await playMove(page, 'e2e4', hasTouch);
  await expectThinking(page);
  await expect(page.getByTestId('search-stats')).toHaveText(
    'depth 3/7 · -0.29 · 798 nodes · 798K n/s',
  );
  await expect(page.getByTestId('search-pv')).toHaveText('1… a5 2. Na3 a4');
  await expectThinking(page);

  // The final line stays once the engine has moved.
  await expectYourMove(page);
  await expectFen(page, 'rnbqkbnr/1ppppppp/8/p7/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  await expect(page.getByTestId('search-pv')).toHaveText('1… a5 2. Na3 a4');
});

test("shows the engine's UCI lines in a panel that starts collapsed", async ({
  page,
  hasTouch,
}) => {
  await newGame(page);
  const transcript = page.getByTestId('transcript');
  await expect(transcript.getByRole('listitem').first()).toBeHidden();

  await transcript.getByText('UCI transcript').click();
  await playAndAwaitReply(page, 'e2e4', hasTouch);
  const lines = transcript.getByRole('listitem');
  await expect(lines.filter({ hasText: `position fen ${START} moves e2e4` })).toHaveCount(1);
  await expect(lines.filter({ hasText: 'bestmove a7a5' })).toHaveAttribute('class', 'received');
});

test('plays black: the engine opens and the board is flipped', async ({ page, hasTouch }) => {
  await newGame(page, 'black');
  await expectFen(page, 'rnbqkbnr/pppppppp/8/8/8/N7/PPPPPPPP/R1BQKBNR b KQkq - 1 1');

  await playMove(page, 'e7e5', hasTouch, 'black');
  await expectYourMove(page);
  await expectFen(page, 'rnbqkbnr/pppp1ppp/8/4p3/8/N7/PPPPPPPP/1RBQKBNR b Kkq - 1 2');
});

test('the board refuses an illegal move', async ({ page, hasTouch }) => {
  await newGame(page);
  await playMove(page, 'e2e5', hasTouch);
  await expectFen(page, START);
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
  await expect(page.getByTestId('game-over-line')).toHaveText('1-0 · by checkmate');

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
  await expectFen(page, 'rnbqkbnr/2pppppp/8/1pP5/8/pP3N2/P2PPPPP/RNBQKB1R w KQkq b6 0 5');
  await playLine(page, ['c5b6', 'b6b7'], hasTouch);
  await expectFen(page, 'rnbqkbnr/1P1ppppp/8/8/2p5/pP3N2/P2PPPPP/RNBQKB1R w KQkq - 0 7');

  const knight = page.getByRole('button', { name: 'Promote to knight' });
  await playMove(page, 'b7a8', hasTouch);
  await expect(knight).toBeVisible();
  await tapSquare(page, 'h8', hasTouch); // outside the pieces
  await expect(knight).toBeHidden();
  await expect(page.locator('cg-board piece.pawn.white')).toHaveCount(8);

  await playMove(page, 'b7a8', hasTouch);
  await (hasTouch ? knight.tap() : knight.click());
  await expectYourMove(page);
  await expectFen(page, 'Nnbqkbnr/3ppppp/8/8/8/pp3N2/P2PPPPP/RNBQKB1R w KQk - 0 8');
  await expectMoves(page, [
    ...['c4', 'a5', 'c5', 'a4', 'b3', 'a3', 'Nf3', 'b5'],
    ...['cxb6', 'c5', 'b7', 'c4', 'bxa8=N', 'cxb3'],
  ]);
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
    await expectFen(page, fen);
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

/** Starts a depth-limited game from `fen`, keeping the side the form picks for it. */
async function newGameFrom(page: Page, fen: string) {
  await showNewGameForm(page);
  await page.getByLabel('Start position').fill(fen);
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await page.getByRole('button', { name: 'New game' }).click();
}

const ENDING = '4k3/8/8/8/4P3/8/8/4K3 w - - 0 40';

test('starts from a FEN as the side to move, numbering moves from it', async ({
  page,
  hasTouch,
}) => {
  await page.getByLabel('white', { exact: true }).check();
  await newGameFrom(page, ENDING.replace(' w ', ' b '));
  await expect(page.getByLabel('black', { exact: true })).toBeChecked();
  await expectYourMove(page);

  await playAndAwaitReply(page, 'e8d7', hasTouch, 'black');
  const moves = page.getByTestId('moves');
  await expect(moves.locator('.number')).toHaveText(['40.', '41.']);
  await expect(moves.locator('li').first()).toHaveText('40.…Kd7');
  await expect(moves.locator('.white')).toHaveCount(1);
});

test('refuses an invalid FEN with a reason and keeps the current game', async ({ page }) => {
  await newGame(page);
  await newGameFrom(page, '4k3/8/8/8/8/8/8/4RK2 w - - 0 1');
  await expect(page.getByTestId('fen-error')).toHaveText(
    'illegal position: the side not to move is in check',
  );
  await expectFen(page, START);
  await expectYourMove(page);
});

test('a FEN that is already mate ends the game at once', async ({ page }) => {
  await newGameFrom(page, 'R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 30');
  await expect(page.getByTestId('game-over-line')).toHaveText('1-0 · by checkmate');
});

test('copies the FEN through the Clipboard API', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await newGameFrom(page, ENDING);
  await expectYourMove(page);
  await page.getByRole('button', { name: 'Copy FEN' }).click();
  await expect(page.getByTestId('copied')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(ENDING);
});

test('copies the FEN without the Clipboard API, as over plain HTTP', async ({ page }) => {
  // localhost counts as a secure context; a LAN address does not, and there the API is missing.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false });
    addEventListener('copy', (event) => {
      document.documentElement.dataset.copied = (event.target as HTMLTextAreaElement).value;
    });
  });
  await openSettled(page);
  await newGameFrom(page, ENDING);
  await expectYourMove(page);
  await page.getByRole('button', { name: 'Copy FEN' }).click();
  await expect(page.getByTestId('copied')).toHaveText('Copied');
  await expect(page.locator('html')).toHaveAttribute('data-copied', ENDING);
});

test('falls through to execCommand when the Clipboard API rejects', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
    addEventListener('copy', (event) => {
      document.documentElement.dataset.copied = (event.target as HTMLTextAreaElement).value;
    });
  });
  await openSettled(page);
  await newGameFrom(page, ENDING);
  await expectYourMove(page);
  await page.getByRole('button', { name: 'Copy FEN' }).click();
  await expect(page.getByTestId('copied')).toHaveText('Copied');
  await expect(page.locator('html')).toHaveAttribute('data-copied', ENDING);
});

test('says when copying fails by both routes, and still shows no FEN', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
    document.execCommand = () => false;
  });
  await openSettled(page);
  await newGameFrom(page, ENDING);
  await expectYourMove(page);
  await page.getByRole('button', { name: 'Copy FEN' }).click();
  await expect(page.getByTestId('copied')).toHaveText("Couldn't copy");
  await expectFenNotShown(page, ENDING);
});
