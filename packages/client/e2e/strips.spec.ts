import type { Page } from '@playwright/test';
import type { GameState, ServerMessage } from '@stratchess-ui/shared';
import { expect, test } from './fixtures.ts';
import { newGame, openSettled, playAndAwaitReply, START } from './helpers.ts';

const engine = (page: Page) => page.getByTestId('strip-engine');
const human = (page: Page) => page.getByTestId('strip-human');

/** Each chip's text, the raised one marked with a `*`: engine's, then the human's. */
async function chips(page: Page) {
  const shown = async (strip: ReturnType<typeof engine>) => {
    const chip = strip.getByTestId('chip');
    const raised = (await chip.getAttribute('class'))!.includes('raised');
    return `${raised ? '*' : ''}${await chip.textContent()}`;
  };
  return [await shown(engine(page)), await shown(human(page))];
}

for (const side of ['white', 'black'] as const) {
  test(`the engine's strip is above the board and yours below, playing ${side}`, async ({
    page,
  }) => {
    await openSettled(page);
    await newGame(page, side);

    await expect(engine(page).locator('.strip-name')).toHaveText('StratChess (fake) depth 8');
    await expect(human(page).locator('.strip-name')).toHaveText(`You ${side}`);
    const board = (await page.getByTestId('board').boundingBox())!;
    const far = (await engine(page).boundingBox())!;
    const near = (await human(page).boundingBox())!;
    expect(far.y + far.height).toBeLessThanOrEqual(board.y);
    expect(near.y).toBeGreaterThanOrEqual(board.y + board.height);
    const tile = page.viewportSize()!.width >= 960 ? 40 : 32;
    expect((await engine(page).locator('.strip-tile').boundingBox())!.width).toBe(tile);
  });
}

test('a capture shows on the side that made it, with its lead', async ({ page, hasTouch }) => {
  await openSettled(page);
  // A queen against a pawn: white starts 8 up, with nothing yet taken.
  await page.getByLabel('Start position').fill('4k3/8/8/8/8/8/3p4/3QK3 w - - 0 1');
  await newGame(page);
  await expect(human(page).getByTestId('lead')).toHaveText('+8');
  await expect(human(page).getByRole('img')).toHaveCount(0);

  await playAndAwaitReply(page, 'd1d2', hasTouch);
  await expect(human(page).getByRole('img')).toHaveCount(1);
  await expect(human(page).getByRole('img')).toHaveAccessibleName('black pawn');
  await expect(human(page).getByTestId('lead')).toHaveText('+9');
  await expect(engine(page).getByRole('img')).toHaveCount(0);
  await expect(engine(page).getByTestId('lead')).toHaveCount(0);
});

test('the chips follow the game through a move and the reply', async ({ page, hasTouch }) => {
  await openSettled(page);
  await newGame(page);
  expect(await chips(page)).toEqual(['waiting', '*your move']);
  await playAndAwaitReply(page, 'e2e4', hasTouch);
  expect(await chips(page)).toEqual(['waiting', '*your move']);
});

const GAME: GameState = {
  startFen: START,
  fen: START,
  moves: [],
  humanColor: 'white',
  engineName: 'Fake',
  limit: { movetimeMs: 1000 },
  phase: 'starting',
};

test('each phase has its chips, and the limit shows as move time', async ({ page }) => {
  let send: (game: Partial<GameState>) => void = () => {};
  await page.routeWebSocket(/\/ws/, (ws) => {
    send = (game) =>
      ws.send(JSON.stringify({ type: 'game', game: { ...GAME, ...game } } satisfies ServerMessage));
    ws.send(JSON.stringify({ type: 'hello', engines: [] } satisfies ServerMessage));
    send({});
  });
  await page.goto('/');
  await expect(engine(page).locator('.strip-name')).toHaveText('Fake 1000 ms');

  const phases: [Partial<GameState>, string[]][] = [
    [{}, ['*starting', 'waiting']],
    [{ phase: 'human' }, ['waiting', '*your move']],
    [{ phase: 'thinking' }, ['*thinking', 'waiting']],
    [{ phase: 'over', result: 'white', termination: 'checkmate' }, ['lost', 'won']],
    [{ phase: 'over', result: 'black', termination: 'checkmate' }, ['won', 'lost']],
    [{ phase: 'over', result: 'draw', termination: 'stalemate' }, ['draw', 'draw']],
    [{ phase: 'over', reason: 'engine crashed' }, ['ended', 'ended']],
  ];
  for (const [game, expected] of phases) {
    send(game);
    await expect.poll(() => chips(page)).toEqual(expected);
  }
});
