import type { Page, WebSocketRoute } from '@playwright/test';
import { CLOSE_CODES, type GameState, type ServerMessage } from '@stratchess-ui/shared';
import { expect, test } from './fixtures.ts';
import { chip, expectFen, expectFenNotShown, expectYourMove, START } from './helpers.ts';

const GAME: GameState = {
  startFen: START,
  fen: START,
  moves: [],
  humanColor: 'white',
  engineName: 'Fake',
  limit: { depth: 3 },
  phase: 'human',
};

const status = (page: Page) => page.getByTestId('status');

/** Stands in for the server, handing each new connection to `connected`. */
async function scriptedServer(page: Page, connected: (ws: WebSocketRoute, n: number) => void) {
  let connections = 0;
  await page.routeWebSocket(/\/ws/, (ws) => connected(ws, ++connections));
  await page.goto('/');
}

function sendGame(ws: WebSocketRoute, game: GameState) {
  const messages: ServerMessage[] = [
    { type: 'hello', engines: [{ id: 'fake', name: 'Fake' }] },
    { type: 'game', game },
  ];
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

for (const [code, text, button] of [
  [CLOSE_CODES.busy, 'another device is playing', 'Try again'],
  [CLOSE_CODES.replaced, 'opened in another tab', 'Play here'],
] as const) {
  test(`says "${text}", and ${button} takes the game back`, async ({ page }) => {
    await scriptedServer(page, (ws, n) => {
      if (n === 1) void ws.close({ code });
      else sendGame(ws, GAME);
    });
    await expect(status(page)).toHaveText(text);

    await page.getByRole('button', { name: button }).click();
    await expectYourMove(page);
    await expect(status(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: button })).toHaveCount(0);
  });
}

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
