import type { Page } from '@playwright/test';
import type { GameState, ServerMessage } from '@stratchess-ui/shared';
import { expect, test } from './fixtures.ts';
import { expectYourMove, newGame, openSettled, playAndAwaitReply, START } from './helpers.ts';

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

    await expect(engine(page).locator('.strip-name')).toHaveText('StratChess depth 8');
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

test('a captured black piece is outlined in muted on the dark theme only', async ({
  page,
  hasTouch,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSettled(page);
  await page.getByLabel('Start position').fill('4k3/8/8/8/8/8/3p4/3QK3 w - - 0 1');
  await newGame(page);
  await playAndAwaitReply(page, 'd1d2', hasTouch);

  // The limit beside the engine's name is in muted too, which keeps the token's value out of here.
  const muted = await engine(page)
    .locator('.strip-detail')
    .evaluate((el) => getComputedStyle(el).color);
  const outline = ['0px -0.5px', '0px 0.5px', '-0.5px 0px', '0.5px 0px']
    .map((offset) => `drop-shadow(${muted} ${offset} 0px)`)
    .join(' ');
  const pawn = human(page).getByRole('img', { name: 'black pawn' });
  await expect(pawn).toHaveCSS('filter', outline);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect(pawn).toHaveCSS('filter', 'none');
});

test('a captured white piece has no outline', async ({ page, hasTouch }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openSettled(page);
  // The pawn gives check, and black to move takes it.
  await page.getByLabel('Start position').fill('3qk3/3P4/8/8/8/8/8/4K3 b - - 0 1');
  await newGame(page, 'black');
  await playAndAwaitReply(page, 'd8d7', hasTouch, 'black');

  await expect(human(page).getByRole('img', { name: 'white pawn' })).toHaveCSS('filter', 'none');
});

test('the chips follow the game through a move and the reply', async ({ page, hasTouch }) => {
  await openSettled(page);
  await newGame(page);
  expect(await chips(page)).toEqual(['waiting', '*your move']);
  await playAndAwaitReply(page, 'e2e4', hasTouch);
  expect(await chips(page)).toEqual(['waiting', '*your move']);
});

test("the engine's id name is still on its strip after a reload", async ({ page }) => {
  await openSettled(page);
  await newGame(page);
  await page.reload();
  await expectYourMove(page);
  await expect(engine(page).locator('.strip-name')).toHaveText('StratChess depth 8');
  await expect(engine(page).locator('.strip-tile')).toHaveText('S');
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
  await expect(engine(page).locator('.strip-tile')).toHaveText('F');

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

test('the id name replaces the profile name, its tile following', async ({ page }) => {
  await page.routeWebSocket(/\/ws/, (ws) => {
    ws.send(JSON.stringify({ type: 'hello', engines: [] } satisfies ServerMessage));
    const game = { ...GAME, phase: 'human', engineIdName: 'Delta 2.1' } satisfies GameState;
    ws.send(JSON.stringify({ type: 'game', game } satisfies ServerMessage));
  });
  await page.goto('/');
  await expect(engine(page).locator('.strip-name')).toHaveText('Delta 2.1 1000 ms');
  await expect(engine(page).locator('.strip-tile')).toHaveText('D');
});

test('a long id name truncates, leaving the limit whole and the strip unbroken', async ({
  page,
}) => {
  await page.routeWebSocket(/\/ws/, (ws) => {
    ws.send(JSON.stringify({ type: 'hello', engines: [] } satisfies ServerMessage));
    const game = { ...GAME, phase: 'human', engineIdName: 'Long'.repeat(50) } satisfies GameState;
    ws.send(JSON.stringify({ type: 'game', game } satisfies ServerMessage));
  });
  await page.goto('/');
  const text = engine(page).locator('.strip-name-text');
  await expect(text).toHaveText('Long'.repeat(50));

  const [line, detail, chip] = await Promise.all([
    engine(page).locator('.strip-name').boundingBox(),
    engine(page).locator('.strip-detail').boundingBox(),
    engine(page).getByTestId('chip').boundingBox(),
  ]);
  expect(detail!.x + detail!.width).toBeLessThanOrEqual(line!.x + line!.width);
  expect(line!.x + line!.width).toBeLessThanOrEqual(chip!.x);
  expect(await text.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
