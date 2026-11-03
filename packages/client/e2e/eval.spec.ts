import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  expectFen,
  expectYourMove,
  newGame,
  openSettled,
  scriptedServer,
  START,
} from './helpers.ts';

// GameScreen's breakpoint, the min-width of app.css's media query.
const DESKTOP = 960;

const bar = (page: Page) => page.getByTestId('eval-bar');
const number = (page: Page) => page.getByTestId('eval-number');

test('before the first search the bar is at half with no number', async ({ page }) => {
  await scriptedServer(page);
  await expect(bar(page)).toHaveAttribute('aria-valuenow', '50');
  await expect(bar(page)).toHaveAccessibleName('Evaluation not yet known');
  await expect(number(page)).toHaveCount(0);
});

test('only exact scores move the bar, and a new game resets it', async ({ page }) => {
  const server = await scriptedServer(page);
  server.search(START, { depth: 1, score: { cp: -320 } });
  await expect(bar(page)).toHaveAccessibleName('Evaluation -3.2 for white');
  await expect(bar(page)).toHaveAttribute('aria-valuenow', '32');

  // An aspiration fail and a line with no score; the depth shows each one has arrived.
  server.search(START, { depth: 2, score: { cp: 700 }, bound: 'lower' });
  await expect(page.getByTestId('search-stats')).toHaveText(/depth 2/);
  server.search(START, { depth: 3, pv: ['e4'] });
  await expect(page.getByTestId('search-stats')).toHaveText(/depth 3/);
  await expect(bar(page)).toHaveAccessibleName('Evaluation -3.2 for white');

  // SearchInfo empties when the engine starts on another position; the bar holds.
  const after = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  server.game({ fen: after, moves: ['e2e4'], lastMove: 'e2e4' });
  await expectFen(page, after);
  await expect(page.getByTestId('search')).toBeHidden();
  await expect(bar(page)).toHaveAccessibleName('Evaluation -3.2 for white');

  server.search(after, { depth: 4, score: { mate: -3 } });
  await expect(bar(page)).toHaveAccessibleName('Black mates in 3');
  await expect(bar(page)).toHaveAttribute('aria-valuenow', '0');

  await page.getByTestId('show-new-game').click();
  await page.getByRole('button', { name: 'New game' }).click();
  await expect.poll(() => server.newGames.length).toBe(1);
  server.game({ phase: 'human', humanColor: 'white' });
  await expectYourMove(page);
  await expect(bar(page)).toHaveAttribute('aria-valuenow', '50');
  await expect(number(page)).toHaveCount(0);
});

for (const side of ['white', 'black'] as const) {
  test(`the bar lines up with the board, white's edge on the human's side, playing ${side}`, async ({
    page,
  }) => {
    await openSettled(page);
    await newGame(page, side);
    // The fake's last line is +0.29 from its side; its first move as white or reply as black.
    if (side === 'black') {
      await expect(bar(page)).toHaveAccessibleName('Evaluation +0.3 for white');
    } else {
      await expect(bar(page)).toHaveAccessibleName('Evaluation not yet known');
    }
    await expectYourMove(page);

    const board = (await page.getByTestId('board').boundingBox())!;
    const strip = (await bar(page).boundingBox())!;
    const white = (await bar(page).locator('.eval-white').boundingBox())!;
    if (page.viewportSize()!.width >= DESKTOP) {
      // GameScreen: left of the board, its full height, `eval-bar-width` wide, with the number.
      expect(strip.x + strip.width).toBeLessThan(board.x);
      expect(strip.y).toBeCloseTo(board.y, 0);
      expect(strip.height).toBeCloseTo(board.height, 0);
      expect(strip.width).toBe(20);
      const whiteEdge = side === 'white' ? strip.y + strip.height : strip.y;
      expect(side === 'white' ? white.y + white.height : white.y).toBeCloseTo(whiteEdge, 0);
      if (side === 'black') {
        // White leads, so the number sits at white's end: the top.
        const label = (await number(page).boundingBox())!;
        await expect(number(page)).toHaveText('0.3');
        expect(label.y).toBeLessThan(strip.y + strip.height / 2);
      }
    } else {
      // GameScreenPhone: an 8px strip above the board, edge to edge, with no number.
      expect(white.height).toBeCloseTo(8, 0);
      expect(strip.width).toBe(page.viewportSize()!.width);
      expect(strip.y + strip.height).toBeLessThanOrEqual(board.y);
      const whiteEdge = side === 'white' ? strip.x : strip.x + strip.width;
      expect(side === 'white' ? white.x : white.x + white.width).toBeCloseTo(whiteEdge, 0);
      await expect(number(page)).toBeHidden();
    }
  });
}
