import type { Page } from '@playwright/test';
import type { GameState } from '@stratchess-ui/shared';
import { expect, test } from './fixtures.ts';
import {
  dragMove,
  expectFen,
  expectYourMove,
  openSettled,
  scriptedServer,
  showNewGameForm,
  START,
  submitNewGame,
} from './helpers.ts';

// The fake-play engine's best move is the first legal one, here Ra1: a rook move, so the arrow is
// straight.
const ROOK_ENDGAME = '6k1/5ppp/8/8/8/8/r4PPP/1R4K1 w - - 0 1';
const YOUR_MOVE: Partial<GameState> = { humanColor: 'white', phase: 'human', fen: START };

const hint = (page: Page) => page.getByRole('button', { name: /^Hint/ });
const left = (page: Page) => page.getByTestId('hints-left');
const board = (page: Page) => page.getByTestId('board');
// Not filtered on visibility: Playwright sees a straight arrow's line as a box of zero width.
const shapes = (page: Page, shape: 'circle' | 'line') => page.locator(`svg.cg-shapes ${shape}`);

test('shows the piece, then the move, for one hint, and keeps it through a reload', async ({
  page,
}) => {
  await openSettled(page);
  await showNewGameForm(page);
  await page.getByRole('combobox', { name: 'Engine' }).selectOption('fake-play');
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await page.getByLabel('Start position').fill(ROOK_ENDGAME);
  // Without verdicts, the hint runs the position search on demand.
  await page.getByLabel('Move Feedback').uncheck();
  await submitNewGame(page);
  await expectFen(page, ROOK_ENDGAME);
  await expectYourMove(page);
  await expect(left(page)).toHaveText('3');

  await hint(page).click();
  await expect(board(page)).toHaveAttribute('data-hint', 'b1');
  await expect(shapes(page, 'circle')).toHaveCount(1);
  await expect(left(page)).toHaveText('2');

  await hint(page).click();
  await expect(board(page)).toHaveAttribute('data-hint', 'b1a1');
  await expect(shapes(page, 'line')).toHaveCount(1);
  await expect(shapes(page, 'circle')).toHaveCount(0);
  await expect(left(page)).toHaveText('2');
  await expect(hint(page)).toBeDisabled();

  await page.reload();
  await expect(board(page)).toHaveAttribute('data-hint', 'b1a1');
  await expect(shapes(page, 'line')).toHaveCount(1);
  await expect(left(page)).toHaveText('2');

  // The arrow is drawn over the board; a piece dragged elsewhere must still move.
  await dragMove(page, 'h2h3');
  await expect(page.getByTestId('moves').locator('.san').first()).toHaveText('h3');
  await expect(board(page)).not.toHaveAttribute('data-hint');
  await expect(shapes(page, 'line')).toHaveCount(0);
});

test('sends one request until the server answers, with a game state or an error', async ({
  page,
}) => {
  const server = await scriptedServer(page);
  server.game(YOUR_MOVE);
  await expect(hint(page)).toBeEnabled();

  await hint(page).click();
  await expect(hint(page)).toBeDisabled();
  await expect.poll(() => server.hints.length).toBe(1);
  server.error('no hint for this position');
  await expect(hint(page)).toBeEnabled();

  await hint(page).click();
  await expect.poll(() => server.hints.length).toBe(2);
  server.game({ ...YOUR_MOVE, hint: { from: 'e2' }, hintsLeft: 2 });
  await expect(left(page)).toHaveText('2');
  await expect(hint(page)).toBeEnabled();
});

test('is disabled while the engine thinks, with none left, and once the game is over', async ({
  page,
}) => {
  const server = await scriptedServer(page);
  await expect(hint(page)).toBeDisabled();
  server.game({ ...YOUR_MOVE, hintsLeft: 0 });
  await expect(left(page)).toHaveText('0');
  await expect(hint(page)).toBeDisabled();
  // A hint already shown still has its second stage.
  server.game({ ...YOUR_MOVE, hintsLeft: 0, hint: { from: 'e2' } });
  await expect(hint(page)).toBeEnabled();
  server.game({ ...YOUR_MOVE, phase: 'over', reason: 'the engine failed' });
  await expect(hint(page)).toBeDisabled();
});

test('clears the board once the hinted turn is played', async ({ page }) => {
  const server = await scriptedServer(page);
  server.game({ ...YOUR_MOVE, hint: { from: 'e2', to: 'e4' } });
  await expect(shapes(page, 'line')).toHaveCount(1);
  server.game({
    humanColor: 'white',
    phase: 'thinking',
    moves: ['e2e4'],
    lastMove: 'e2e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  });
  await expect(board(page)).not.toHaveAttribute('data-hint');
  await expect(shapes(page, 'line')).toHaveCount(0);
});
