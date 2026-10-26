import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { CLOSE_CODES, START_FEN, type ServerMessage } from '@stratchess-ui/shared';
import { buildApp, type AppOptions } from './app.ts';
import { Controller } from './game/controller.ts';
import { memoryStore, Pairings, type PairingStore } from './pairing.ts';
import { UciEngine } from './uci/engine.ts';
import { fakeProfile } from './uci/fake-profile.ts';

const CODE = '123456';

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
  vi.restoreAllMocks();
});

/** An app whose pairing code is CODE, with the store exposed so a test can revoke a token. */
async function build(options: Partial<AppOptions> = {}) {
  const store: PairingStore = memoryStore();
  const pairings = new Pairings({ store, announce: () => {}, fixedCode: CODE });
  app = await buildApp({ port: 0, profiles: [fakeProfile('legal')], pairings, ...options });
  await app.ready();
  return store;
}

async function pair(code = CODE) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/pair',
    headers: { host: 'localhost' },
    payload: { code },
  });
  return { status: res.statusCode, token: (res.json() as { token?: string }).token };
}

async function pairedToken() {
  return (await pair()).token!;
}

/** Connects and buffers every message from the first, which the server sends on open. */
async function connect(app: FastifyInstance, token?: string) {
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  const onMessage = (data: Buffer) => {
    const msg = JSON.parse(data.toString()) as ServerMessage;
    const resolve = waiting.shift();
    if (resolve) resolve(msg);
    else queue.push(msg);
  };
  let onClose: (code: number) => void;
  const closed = new Promise<number>((resolve) => (onClose = resolve));
  const ws: WebSocket = await app.injectWS(
    token === undefined ? '/ws' : `/ws?token=${token}`,
    { headers: { host: 'localhost' } },
    {
      onInit: (socket) => {
        socket.on('message', onMessage);
        socket.on('close', (code) => onClose(code));
      },
    },
  );
  const next = () =>
    new Promise<ServerMessage>((resolve) => {
      const msg = queue.shift();
      if (msg) resolve(msg);
      else waiting.push(resolve);
    });
  /** The next game state the human can move in. */
  const yourMove = async () => {
    for (;;) {
      const msg = await next();
      if (msg.type === 'game' && msg.game.phase === 'human') return msg.game;
    }
  };
  return { ws, next, yourMove, closed };
}

const NEW_GAME = { type: 'new-game', humanColor: 'white', engineId: 'fake', limit: { depth: 1 } };

describe('server', () => {
  it('answers on localhost', async () => {
    app = await buildApp({ port: 0 });
    const res = await app.inject({ url: '/api/health', headers: { host: 'localhost:8080' } });
    expect(res.statusCode).toBe(200);
  });

  it('rejects an unknown Host', async () => {
    app = await buildApp({ port: 0 });
    const res = await app.inject({ url: '/api/health', headers: { host: 'evil.example' } });
    expect(res.statusCode).toBe(421);
  });

  it('rejects a request from another site', async () => {
    await build();
    const res = await app.inject({
      method: 'POST',
      url: '/api/pair',
      headers: { host: 'localhost', origin: 'http://evil.example' },
      payload: { code: CODE },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('origin not allowed');
    const sandboxed = await app.inject({
      url: '/api/health',
      headers: { host: 'localhost', origin: 'null' },
    });
    expect(sandboxed.statusCode).toBe(403);
  });

  it('offers its engines and plays a game over the socket', async () => {
    await build();
    const { ws, next, yourMove } = await connect(app, await pairedToken());
    expect(await next()).toEqual({
      type: 'hello',
      engines: [{ id: 'fake', name: 'StratChess (fake)' }],
    });

    ws.send(JSON.stringify({ type: 'move', uci: '{' }));
    expect(await next()).toEqual({ type: 'error', reason: 'no game in progress' });
    ws.send(JSON.stringify({ type: 'new-game', humanColor: 'white', engineId: 'fake' }));
    expect(await next()).toEqual({ type: 'error', reason: 'malformed message' });

    const limit = { movetimeMs: 100 };
    ws.send(JSON.stringify({ type: 'new-game', humanColor: 'white', engineId: 'fake', limit }));
    expect(await next()).toMatchObject({ type: 'game', game: { phase: 'starting' } });
    expect(await next()).toMatchObject({ type: 'game', game: { phase: 'human' } });
    ws.send(JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(await next()).toMatchObject({ game: { phase: 'thinking', lastMove: 'e2e4' } });
    expect(await next()).toMatchObject({ type: 'search', info: { depth: 1 } });
    expect(await yourMove()).toMatchObject({ lastMove: 'a7a5' });
    ws.terminate();
  });

  it('pairs only with the code', async () => {
    await build();
    expect(await pair('654321')).toEqual({ status: 403, token: undefined });
    const { status, token } = await pair();
    expect(status).toBe(200);
    expect(token).toMatch(/^[\w-]{43}$/);
  });

  it('refuses a socket without a paired token', async () => {
    const store = await build();
    expect(await (await connect(app)).closed).toBe(CLOSE_CODES.notPaired);
    expect(await (await connect(app, 'guess')).closed).toBe(CLOSE_CODES.notPaired);

    const token = await pairedToken();
    store.save(store.load().filter((p) => p.token !== token));
    expect(await (await connect(app, token)).closed).toBe(CLOSE_CODES.notPaired);
  });

  it('refuses a second paired browser while the first controls the game', async () => {
    await build();
    const first = await connect(app, await pairedToken());
    first.ws.send(JSON.stringify(NEW_GAME));
    await first.yourMove();

    const second = await connect(app, await pairedToken());
    expect(await second.closed).toBe(CLOSE_CODES.busy);
    first.ws.send(JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(await first.yourMove()).toMatchObject({ lastMove: 'a7a5' });
  });

  it('hands the game to the same browser on a new socket, closing the old one', async () => {
    await build();
    const token = await pairedToken();
    const first = await connect(app, token);
    first.ws.send(JSON.stringify({ ...NEW_GAME, humanColor: 'black' }));
    await first.yourMove();

    const second = await connect(app, token);
    expect(await first.closed).toBe(CLOSE_CODES.replaced);
    expect(await second.next()).toMatchObject({ type: 'hello' });
    expect(await second.next()).toMatchObject({ game: { phase: 'human' } });
    // The engine's last line about its opening move, still shown on the new socket.
    expect(await second.next()).toEqual({
      type: 'search',
      fen: START_FEN,
      info: {
        depth: 3,
        seldepth: 7,
        score: { cp: 29 },
        nodes: 798,
        nps: 798000,
        pv: ['d4', 'd5', 'Nf3'],
      },
    });
  });

  it('resumes the game when the browser reconnects within the grace period', async () => {
    await build();
    const token = await pairedToken();
    const first = await connect(app, token);
    first.ws.send(JSON.stringify(NEW_GAME));
    await first.yourMove();
    first.ws.send(JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(await first.next()).toMatchObject({ game: { phase: 'thinking' } });
    const detach = vi.spyOn(Controller.prototype, 'detach');
    first.ws.terminate();
    // Reconnecting before the server has seen the drop would test a replacement instead.
    await vi.waitFor(() => expect(detach).toHaveBeenCalled());

    const again = await connect(app, token);
    expect(await again.next()).toMatchObject({ type: 'hello' });
    // The engine may answer before or after the reconnect; either way the game carries on.
    expect(await again.yourMove()).toMatchObject({ lastMove: 'a7a5' });
    again.ws.send(JSON.stringify({ type: 'move', uci: 'd2d4' }));
    expect(await again.yourMove()).toMatchObject({ lastMove: 'a5a4' });
  });

  it('ends the engine and frees the game when the grace period runs out', async () => {
    await build({ graceMs: 50 });
    const quit = vi.spyOn(UciEngine.prototype, 'quit');
    const first = await connect(app, await pairedToken());
    first.ws.send(JSON.stringify(NEW_GAME));
    await first.yourMove();
    first.ws.terminate();

    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());
    await quit.mock.results[0]!.value;
    const other = await connect(app, await pairedToken());
    expect(await other.next()).toMatchObject({ type: 'hello' });
    other.ws.send(JSON.stringify({ type: 'move', uci: 'e2e4' }));
    expect(await other.next()).toEqual({ type: 'error', reason: 'no game in progress' });
  });
});
