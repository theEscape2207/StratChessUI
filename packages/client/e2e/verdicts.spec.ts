import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import {
  expectFen,
  expectMoves,
  expectYourMove,
  openSettled,
  playAndAwaitReply,
  scriptedServer,
  showNewGameForm,
  submitNewGame,
} from './helpers.ts';

// White mates with Rb8 and has equal material otherwise. The fake-play engine scores a mate in
// one as a mate and anything else by material, so any other move gives up a won game: a blunder.
const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/r4PPP/1R4K1 w - - 0 1';

const feedback = (page: Page) => page.getByLabel('Move Feedback');
const boardBadge = (page: Page) => page.getByTestId('board-badge');
const listBadges = (page: Page) => page.getByTestId('moves').getByTestId('quality-badge');
const listed = (page: Page, side: 'white' | 'black', verdict: string) =>
  page.getByTestId('moves').locator(`.${side}`).getByRole('img', { name: verdict });

/** Within a pixel, as layout rounds to fractions of one. */
function expectNear(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

async function newGameFrom(page: Page, fen: string, analysis: boolean) {
  await showNewGameForm(page);
  await page.getByRole('combobox', { name: 'Engine' }).selectOption('fake-play');
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await page.getByLabel('Start position').fill(fen);
  await feedback(page).setChecked(analysis);
  await submitNewGame(page);
  // The game this browser resumed can read "your move" too, so wait for the new one's position.
  await expectFen(page, fen);
  await expectYourMove(page);
}

async function box(locator: Locator) {
  return (await locator.boundingBox())!;
}

/** The square's box on screen, seen from `bottom`'s side. */
async function squareBox(page: Page, square: string, bottom: 'white' | 'black') {
  const board = await box(page.getByTestId('board'));
  const size = board.width / 8;
  let column = square.charCodeAt(0) - 'a'.charCodeAt(0);
  let row = 8 - Number(square[1]);
  if (bottom === 'black') [column, row] = [7 - column, 7 - row];
  return { x: board.x + column * size, y: board.y + row * size, size, board };
}

test('with the checkbox on, a blunder shows on the board and in the move list', async ({
  page,
  hasTouch,
}) => {
  await openSettled(page);
  await newGameFrom(page, MATE_IN_ONE, true);
  await playAndAwaitReply(page, 'h2h3', hasTouch);

  await expect(boardBadge(page)).toHaveAttribute('data-square', 'h3');
  await expect(boardBadge(page).getByRole('img', { name: 'blunder' })).toHaveText('??');
  await expect(listBadges(page)).toHaveCount(1);
  await expect(listed(page, 'white', 'blunder')).toHaveText('??');
  await expectMoves(page, ['h3', 'Ra1']);

  // On h3's top edge, but pulled in from the h-file's corner to stay on the board and the page.
  const badge = await box(boardBadge(page).getByRole('img'));
  const square = await squareBox(page, 'h3', 'white');
  expectNear(badge.x + badge.width, square.board.x + square.board.width);
  expectNear(badge.y, square.y - 8);
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sideways).toBe(0);
});

test('Copy PGN carries the blunder as a glyph, and the start position', async ({
  page,
  context,
  hasTouch,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openSettled(page);
  await newGameFrom(page, MATE_IN_ONE, true);
  await playAndAwaitReply(page, 'h2h3', hasTouch);
  await expect(listed(page, 'white', 'blunder')).toHaveText('??');

  await page.getByRole('button', { name: 'Copy PGN' }).click();
  await expect(page.getByTestId('copied')).toHaveText('Copied');
  const pgn = await page.evaluate(() => navigator.clipboard.readText());
  expect(pgn).toContain('[White "You"]');
  expect(pgn).toContain(`[FEN "${MATE_IN_ONE}"]`);
  expect(pgn).toMatch(/\[Depth "\d+"\]/);
  // chessops numbers the move after a glyph afresh.
  expect(pgn).toContain('1. h3 $4 1... Ra1 *');
});

test('with the checkbox off, no move has a verdict', async ({ page, hasTouch }) => {
  await openSettled(page);
  await newGameFrom(page, MATE_IN_ONE, false);
  await playAndAwaitReply(page, 'h2h3', hasTouch);

  await expectMoves(page, ['h3', 'Ra1']);
  await expect(page.getByTestId('quality-badge')).toHaveCount(0);
  await expect(page.getByTestId('move-feedback')).toHaveCount(0);
});

test('the new game asks for verdicts unless unchecked, and keeps the choice', async ({ page }) => {
  const server = await scriptedServer(page);
  await showNewGameForm(page);
  await expect(feedback(page)).toBeChecked();
  await submitNewGame(page);
  await expect.poll(() => server.newGames.length).toBe(1);
  expect(server.newGames[0]).toHaveProperty('analysis', true);

  await feedback(page).uncheck();
  await submitNewGame(page);
  await expect.poll(() => server.newGames.length).toBe(2);
  expect(server.newGames[1]).not.toHaveProperty('analysis');
  await expect(feedback(page)).not.toBeChecked();
});

test("the board shows the human's latest verdict until the engine captures there", async ({
  page,
}) => {
  const server = await scriptedServer(page);
  // 1. e4 e5 2. Nf3, the human playing black: best is on the board only, at e5's corner.
  server.game({
    moves: ['e2e4', 'e7e5', 'g1f3'],
    verdicts: [null, 'best', null],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    lastMove: 'g1f3',
    phase: 'human',
  });
  await expect(boardBadge(page).getByRole('img', { name: 'best' })).toHaveText('★');
  await expect(listBadges(page)).toHaveCount(0);
  const badge = await box(boardBadge(page).getByRole('img'));
  const square = await squareBox(page, 'e5', 'black');
  expectNear(badge.x + badge.width / 2, square.x + square.size - 2);
  expectNear(badge.y + badge.height / 2, square.y + 2);

  // 1. e4 d5 2. exd5: the mistake stays in the list, but the board's d5 is white's now.
  server.game({
    moves: ['e2e4', 'd7d5', 'e4d5'],
    verdicts: [null, 'mistake', null],
    fen: 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
    lastMove: 'e4d5',
    phase: 'human',
  });
  await expectMoves(page, ['e4', 'd5', 'exd5']);
  await expect(listBadges(page)).toHaveCount(1);
  await expect(listed(page, 'black', 'mistake')).toHaveText('?');
  await expect(boardBadge(page)).toHaveCount(0);
});

test('a game black opens keeps each verdict on its own move in the list', async ({ page }) => {
  const server = await scriptedServer(page);
  // From the position after 1. e4: 1... e5 2. Nf3, the human playing white.
  server.game({
    startFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    humanColor: 'white',
    moves: ['e7e5', 'g1f3'],
    verdicts: [null, 'inaccuracy'],
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    lastMove: 'g1f3',
    phase: 'thinking',
  });
  await expectMoves(page, ['e5', 'Nf3']);
  await expect(listBadges(page)).toHaveCount(1);
  await expect(listed(page, 'white', 'inaccuracy')).toHaveText('?!');
});
