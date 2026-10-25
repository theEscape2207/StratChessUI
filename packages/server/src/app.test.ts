import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { ServerMessage } from '@stratchess-ui/shared';
import { buildApp } from './app.ts';
import { fakeProfile } from './uci/fake-profile.ts';

let app: FastifyInstance;
afterEach(() => app?.close());

/** Connects and buffers every message from the first, which the server sends on open. */
async function connect(app: FastifyInstance) {
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  const onMessage = (data: Buffer) => {
    const msg = JSON.parse(data.toString()) as ServerMessage;
    const resolve = waiting.shift();
    if (resolve) resolve(msg);
    else queue.push(msg);
  };
  const ws: WebSocket = await app.injectWS(
    '/ws',
    { headers: { host: 'localhost' } },
    { onInit: (socket) => socket.on('message', onMessage) },
  );
  const next = () =>
    new Promise<ServerMessage>((resolve) => {
      const msg = queue.shift();
      if (msg) resolve(msg);
      else waiting.push(resolve);
    });
  return { ws, next };
}

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

  it('offers its engines and plays a game over the socket', async () => {
    app = await buildApp({ port: 0, profiles: [fakeProfile('legal')] });
    await app.ready();
    const { ws, next } = await connect(app);
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
    expect(await next()).toMatchObject({ game: { phase: 'human', lastMove: 'a7a5' } });
    ws.terminate();
  });
});
