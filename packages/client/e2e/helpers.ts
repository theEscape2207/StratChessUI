import { expect, type Page } from '@playwright/test';
import type { GameState, SearchReport, ServerMessage } from '@stratchess-ui/shared';

// The server runs the fake engine, which answers its first legal move (see playwright.config.ts).
export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const chip = (page: Page, side: 'engine' | 'human') =>
  page.getByTestId(`strip-${side}`).getByTestId('chip');

export async function expectYourMove(page: Page) {
  await expect(chip(page, 'human')).toHaveText('your move');
}

export async function expectThinking(page: Page) {
  await expect(chip(page, 'engine')).toHaveText('thinking');
}

export async function expectFen(page: Page, fen: string) {
  await expect(page.getByTestId('board')).toHaveAttribute('data-fen', fen);
}

export async function currentFen(page: Page) {
  return page.getByTestId('board').getAttribute('data-fen');
}

/** The FEN shows nowhere: the closed transcript quotes it, unseen, once the engine has searched. */
export async function expectFenNotShown(page: Page, fen: string) {
  await expect(page.getByText(fen).filter({ visible: true })).toHaveCount(0);
}

/** Clicks (or taps, on touch devices) a square on the board, seen from `bottom`'s side. */
export async function tapSquare(page: Page, sq: string, touch: boolean, bottom = 'white') {
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

export async function playMove(page: Page, uci: string, touch: boolean, bottom = 'white') {
  await tapSquare(page, uci.slice(0, 2), touch, bottom);
  await tapSquare(page, uci.slice(2, 4), touch, bottom);
}

/** During play the new-game form waits behind a button of the same name. */
export async function showNewGameForm(page: Page) {
  const reveal = page.getByTestId('show-new-game');
  if (await reveal.isVisible()) await reveal.click();
}

/** The form's submit, not the game-over dialog's New game, which only opens the form. */
export async function submitNewGame(page: Page) {
  await page.locator('form.new-game').getByRole('button', { name: 'New game' }).click();
}

/**
 * Opens the app as the paired browser, waits until whatever game it resumes is idle, and opens the
 * new-game form.
 */
export async function openSettled(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  // With no game to resume there is no chip, which not.toHaveText would wait for in vain.
  await expect(chip(page, 'engine').filter({ hasText: /thinking|starting/ })).toHaveCount(0);
  await showNewGameForm(page);
}

/** Starts a game with a depth limit, which the fake answers at once; it sleeps out a move time. */
export async function newGame(page: Page, side: 'white' | 'black' = 'white') {
  await showNewGameForm(page);
  await page.getByLabel(side, { exact: true }).check();
  await page.getByRole('combobox', { name: 'Limit' }).selectOption('depth');
  await submitNewGame(page);
  await expectYourMove(page);
}

/**
 * Plays a move as `side` and waits for the engine's reply. The reply can come too fast to see
 * "thinking", and "your move" still shows before the move lands, so this waits on the FEN: it
 * must differ from before the move and have `side` to move again.
 */
export async function playAndAwaitReply(page: Page, uci: string, touch: boolean, side = 'white') {
  const before = await currentFen(page);
  await playMove(page, uci, touch, side);
  await expect
    .poll(async () => {
      const now = await currentFen(page);
      return now !== before && now?.split(' ')[1] === side[0];
    })
    .toBe(true);
  await expectYourMove(page);
}

/** The move list shows exactly these moves in SAN, white's and black's in turn. */
export async function expectMoves(page: Page, sans: string[]) {
  await expect(page.getByTestId('moves').locator('.white, .black')).toHaveText(sans);
}

const SCRIPTED_GAME: GameState = {
  startFen: START,
  fen: START,
  moves: [],
  humanColor: 'black',
  engineName: 'Fake',
  limit: { depth: 3 },
  phase: 'thinking',
};

/** Stands in for the server, so a test can send exactly the messages it needs. */
export async function scriptedServer(page: Page) {
  let send: (msg: ServerMessage) => void = () => {};
  const newGames: unknown[] = [];
  const takebacks: unknown[] = [];
  const resigns: unknown[] = [];
  await page.routeWebSocket(/\/ws/, (ws) => {
    send = (msg) => ws.send(JSON.stringify(msg));
    ws.onMessage((data) => {
      const msg = JSON.parse(String(data));
      if (msg.type === 'new-game') newGames.push(msg);
      if (msg.type === 'takeback') takebacks.push(msg);
      if (msg.type === 'resign') resigns.push(msg);
    });
    send({ type: 'hello', engines: [{ id: 'fake', name: 'Fake' }], hasGame: true });
    send({ type: 'game', game: SCRIPTED_GAME });
  });
  await page.goto('/');
  await expectThinking(page);
  return {
    game: (game: Partial<GameState>) => send({ type: 'game', game: { ...SCRIPTED_GAME, ...game } }),
    search: (fen: string, info: SearchReport) => send({ type: 'search', fen, info }),
    error: (reason: string) => send({ type: 'error', reason }),
    newGames,
    takebacks,
    resigns,
  };
}
