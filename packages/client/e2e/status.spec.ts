import type { Page, WebSocketRoute } from '@playwright/test';
import { CLOSE_CODES, type GameState, type ServerMessage } from '@stratchess-ui/shared';
import { expect, test } from './fixtures.ts';
import {
  chip,
  expectFen,
  expectFenNotShown,
  expectMoves,
  expectYourMove,
  showNewGameForm,
  START,
  submitNewGame,
} from './helpers.ts';

const GAME: GameState = {
  startFen: START,
  fen: START,
  moves: [],
  humanColor: 'white',
  engineName: 'Fake',
  limit: { depth: 3 },
  phase: 'human',
};

const HELLO: ServerMessage = {
  type: 'hello',
  engines: [{ id: 'fake', name: 'Fake' }],
  hasGame: true,
};

const status = (page: Page) => page.getByTestId('status');

/** Stands in for the server, handing each new connection to `connected`. */
async function scriptedServer(page: Page, connected: (ws: WebSocketRoute, n: number) => void) {
  let connections = 0;
  await page.routeWebSocket(/\/ws/, (ws) => connected(ws, ++connections));
  await page.goto('/');
}

function sendGame(ws: WebSocketRoute, game: GameState) {
  const messages: ServerMessage[] = [HELLO, { type: 'game', game }];
  for (const msg of messages) ws.send(JSON.stringify(msg));
}

for (const [phase, side, text] of [
  ['starting', 'engine', 'starting'],
  ['human', 'human', 'your move'],
  ['thinking', 'engine', 'thinking'],
] as const) {
  test(`while ${text}, only the chips say so`, async ({ page }) => {
    await scriptedServer(page, (ws) => sendGame(ws, { ...GAME, phase }));
    await expect(chip(page, side)).toHaveText(text);
    await expect(status(page)).toHaveCount(0);
    await expectFenNotShown(page, START);
  });
}

test('a game in progress shows no FEN once a move is on the board', async ({ page }) => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  await scriptedServer(page, (ws) =>
    sendGame(ws, { ...GAME, fen, moves: ['e2e4'], lastMove: 'e2e4', phase: 'thinking' }),
  );
  await expectFen(page, fen);
  await expectFenNotShown(page, fen);
});

test('says when the socket is still connecting', async ({ page }) => {
  await page.addInitScript(() => {
    // Never opens.
    window.WebSocket = class {
      close() {}
    } as unknown as typeof WebSocket;
  });
  await page.goto('/');
  await expect(status(page)).toHaveText('connecting');
});

test('says when the socket dropped, and clears once it is back', async ({ page }) => {
  await scriptedServer(page, (ws, n) => {
    if (n === 1) void ws.close({ code: 1011 });
    else sendGame(ws, GAME);
  });
  await expect(status(page)).toHaveText('disconnected, reconnecting');
  await expectYourMove(page);
  await expect(status(page)).toHaveCount(0);
});

test('says a game in play is safe through the whole retry', async ({ page }) => {
  let first: WebSocketRoute;
  await page.routeWebSocket(/\/ws/, (ws) => {
    first = ws;
    sendGame(ws, GAME);
  });
  // Later sockets never open, as on a dead network, holding the retry in "connecting".
  await page.addInitScript(() => {
    const Real = window.WebSocket;
    const sockets = { count: 0 };
    Object.assign(window, { sockets });
    window.WebSocket = function (url: string) {
      return ++sockets.count === 1 ? new Real(url) : { close() {} };
    } as unknown as typeof WebSocket;
  });
  await page.goto('/');
  await expectYourMove(page);

  await first!.close({ code: 1011 });
  const safe = 'disconnected, your game is safe, reconnecting';
  await expect(status(page)).toHaveText(safe);
  await page.waitForFunction(
    () => (window as unknown as { sockets: { count: number } }).sockets.count === 2,
  );
  await expect(status(page)).toHaveText(safe);
});

test('a finished game does not claim to be safe while disconnected', async ({ page }) => {
  let first: WebSocketRoute;
  await scriptedServer(page, (ws, n) => {
    if (n > 1) return;
    first = ws;
    sendGame(ws, { ...GAME, phase: 'over', result: 'white', termination: 'checkmate' });
  });
  await expect(status(page)).toHaveText('game over: white wins by checkmate');
  await first!.close({ code: 1011 });
  await expect(status(page)).toHaveText('disconnected, reconnecting');
});

test('a game the server no longer has is cleared, with the reason', async ({ page }) => {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  let first: WebSocketRoute;
  await scriptedServer(page, (ws, n) => {
    if (n > 1) return ws.send(JSON.stringify({ ...HELLO, hasGame: false }));
    first = ws;
    sendGame(ws, { ...GAME, fen, moves: ['e2e4', 'e7e5'], lastMove: 'e7e5' });
    const line = { dir: 'sent', text: 'uci' } as const;
    ws.send(JSON.stringify({ type: 'transcript', lines: [line] } satisfies ServerMessage));
  });
  await expectFen(page, fen);
  await expectMoves(page, ['e4', 'e5']);
  await expect(page.getByTestId('transcript')).toBeAttached();

  await first!.close({ code: 1011 });
  await expect(page.getByTestId('notice')).toHaveText(
    'the game ended because the server restarted',
  );
  await expectFen(page, START);
  await expectMoves(page, []);
  await expect(chip(page, 'human')).toHaveCount(0);
  await expect(page.locator('form.new-game')).toBeVisible();
  await expect(page.getByTestId('transcript')).toHaveCount(0);
});

test('a page with no game says nothing when the server has none either', async ({ page }) => {
  await scriptedServer(page, (ws) => ws.send(JSON.stringify({ ...HELLO, hasGame: false })));
  await expect(page.locator('form.new-game')).toBeVisible();
  await expect(page.getByTestId('notice')).toHaveCount(0);
});

test('says "opened in another tab", and Play here takes the game back', async ({ page }) => {
  await scriptedServer(page, (ws, n) => {
    if (n === 1) void ws.close({ code: CLOSE_CODES.replaced });
    else sendGame(ws, GAME);
  });
  await expect(status(page)).toHaveText('opened in another tab');

  await page.getByRole('button', { name: 'Play here' }).click();
  await expectYourMove(page);
  await expect(status(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Play here' })).toHaveCount(0);
});

test('a refused new game brings the current game back, with the reason', async ({ page }) => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const game: GameState = { ...GAME, fen, moves: ['e2e4'], lastMove: 'e2e4', phase: 'human' };
  await scriptedServer(page, (ws) => {
    sendGame(ws, game);
    ws.onMessage(() => {
      ws.send(JSON.stringify({ type: 'game', game } satisfies ServerMessage));
      const reason = 'limit of 4 engines reached, try again later';
      ws.send(JSON.stringify({ type: 'error', reason } satisfies ServerMessage));
    });
  });
  await expectFen(page, fen);

  await showNewGameForm(page);
  await submitNewGame(page);
  await expect(page.getByTestId('notice')).toHaveText(
    'limit of 4 engines reached, try again later',
  );
  await expectFen(page, fen);
  await expectYourMove(page);
});

test('a rejected move shows its notice until the next game state', async ({ page }) => {
  let server: WebSocketRoute;
  await scriptedServer(page, (ws) => {
    server = ws;
    sendGame(ws, GAME);
  });
  await expectYourMove(page);

  server!.send(JSON.stringify({ type: 'error', reason: 'illegal move: e2e5' }));
  await expect(page.getByTestId('notice')).toHaveText('illegal move: e2e5');

  sendGame(server!, GAME);
  await expect(page.getByTestId('notice')).toHaveCount(0);
});
