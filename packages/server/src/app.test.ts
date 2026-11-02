import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { WebSocket } from 'ws';
import {
  CLOSE_CODES,
  START_FEN,
  type ClientMessage,
  type GamePhase,
  type ServerMessage,
} from '@stratchess-ui/shared';
import { buildApp, type AppOptions } from './app.ts';
import { Controller } from './game/controller.ts';
import { memoryStore, Pairings, type PairingStore } from './pairing.ts';
import { UciEngine } from './uci/engine.ts';
import { fakeProfile } from './uci/fake-profile.ts';

const CODE = '123456';
const ADDRESS = '192.0.2.1';
const OTHER_ADDRESS = '192.0.2.2';

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

/**
 * Connects and buffers every message from the first, which the server sends on open. Transcript
 * messages are read apart from the rest, which they would otherwise interleave unpredictably.
 */
async function connect(app: FastifyInstance, token?: string, remoteAddress = ADDRESS) {
  const queue: ServerMessage[] = [];
  /** Every message so far, transcript included, whether or not a test has taken it. */
  const seen: ServerMessage[] = [];
  let wake = () => {};
  const onMessage = (data: Buffer) => {
    const msg = JSON.parse(data.toString()) as ServerMessage;
    queue.push(msg);
    seen.push(msg);
    wake();
  };
  const take = async (match: (msg: ServerMessage) => boolean): Promise<ServerMessage> => {
    for (;;) {
      const index = queue.findIndex(match);
      if (index >= 0) return queue.splice(index, 1)[0]!;
      await new Promise<void>((resolve) => (wake = resolve));
    }
  };
  let onClose: (code: number) => void;
  const closed = new Promise<number>((resolve) => (onClose = resolve));
  const ws: WebSocket = await app.injectWS(
    token === undefined ? '/ws' : `/ws?token=${token}`,
    // `injectWS` builds a request with no socket of its own, which would leave `request.ip` undefined.
    { headers: { host: 'localhost' }, socket: { remoteAddress } } as object,
    {
      onInit: (socket) => {
        socket.on('message', onMessage);
        socket.on('close', (code) => onClose(code));
      },
    },
  );
  const next = () => take((msg) => msg.type !== 'transcript');
  const transcript = () => take((msg) => msg.type === 'transcript');
  /** The next game state the human can move in. */
  const yourMove = async () => {
    for (;;) {
      const msg = await next();
      if (msg.type === 'game' && msg.game.phase === 'human') return msg.game;
    }
  };
  const send = (msg: object) => ws.send(JSON.stringify(msg));
  return { ws, next, transcript, yourMove, closed, seen, send };
}

const NEW_GAME = { type: 'new-game', humanColor: 'white', engineId: 'fake', limit: { depth: 1 } };

type Client = Awaited<ReturnType<typeof connect>>;

/** A newly paired browser with a game started, its turn to move. */
async function browserInGame(remoteAddress = ADDRESS): Promise<Client> {
  const client = await connect(app, await pairedToken(), remoteAddress);
  client.send(NEW_GAME);
  await client.yourMove();
  return client;
}

/** Plays a move, expecting the given reply from that browser's engine. */
async function playAndExpect(client: Client, uci: string, reply: string) {
  client.send({ type: 'move', uci });
  expect(await client.yourMove()).toMatchObject({ lastMove: reply });
}

function engineLimitError(limit: number) {
  return { type: 'error', reason: `limit of ${limit} engines reached, try again later` };
}

/** Starts a new game with the server sending refusals until an engine has exited and freed a slot. */
async function startOnceSlotFree(client: Client, limit: number) {
  for (;;) {
    client.send(NEW_GAME);
    const msg = await untilGameOrError(client, 'starting');
    if (msg.type === 'game') return msg;
    expect(msg).toEqual(engineLimitError(limit));
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** The next error, or the next game state in `phase`. */
async function untilGameOrError(client: Client, phase: GamePhase) {
  for (;;) {
    const msg = await client.next();
    if (msg.type === 'error' || (msg.type === 'game' && msg.game.phase === phase)) return msg;
  }
}

/** The engines started so far, through a spy on `UciEngine.start`. */
function startedEngines(start: MockInstance<typeof UciEngine.start>) {
  return Promise.all(start.mock.results.map((result) => result.value as Promise<UciEngine>));
}

/** A paired browser in a game on `limit`, its turn to move, with its token for reconnecting. */
async function tokenInGame(limit: object, fen?: string) {
  const token = await pairedToken();
  const client = await connect(app, token);
  client.send({ ...NEW_GAME, limit, fen });
  await client.yourMove();
  return { token, client };
}

/** Plays `uci` and drops the socket while the engine is searching its reply. */
async function moveAndLeave(client: Client, uci: string) {
  client.send({ type: 'move', uci });
  expect(await untilGameOrError(client, 'thinking')).toMatchObject({ type: 'game' });
  client.ws.terminate();
}

/** Connects again, past `hello`, returning the game state it is sent. */
async function reconnect(token: string) {
  const client = await connect(app, token);
  expect(await client.next()).toMatchObject({ type: 'hello' });
  const msg = await client.next();
  if (msg.type !== 'game') throw new Error(`expected a game, got ${msg.type}`);
  return { client, game: msg.game };
}

/** Longer than the grace periods below, so a test can act while the engine is still searching. */
const SLOW = { movetimeMs: 500 };
/** Black's first legal move is Ra1, which mates, once White has made any quiet move. */
const BACK_RANK_FEN = 'r6k/8/8/8/8/1P6/5PPP/6K1 w - - 0 1';
/** White mates with Ra8. */
const MATE_IN_ONE_FEN = '7k/5ppp/8/8/8/8/8/R5K1 w - - 0 1';

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
    expect(await next()).toMatchObject({ type: 'game', game: { phase: 'starting', limit } });
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

  it('plays two browsers at once with separate engines, keeping their games apart', async () => {
    await build();
    const start = vi.spyOn(UciEngine, 'start');
    const white = await browserInGame();
    const black = await connect(app, await pairedToken());
    black.send({ ...NEW_GAME, humanColor: 'black' });
    await black.yourMove();
    expect(start).toHaveBeenCalledTimes(2);
    const [one, two] = await startedEngines(start);
    expect(one).not.toBe(two);

    await playAndExpect(white, 'e2e4', 'a7a5');
    await playAndExpect(black, 'd7d5', 'a1b1');
    await playAndExpect(white, 'd2d4', 'a5a4');

    const games = (client: Client) => client.seen.flatMap((m) => (m.type === 'game' ? m.game : []));
    expect(games(white).every((game) => game.humanColor === 'white')).toBe(true);
    expect(games(black).every((game) => game.humanColor === 'black')).toBe(true);
    expect(games(white).at(-1)!.moves).toEqual(['e2e4', 'a7a5', 'd2d4', 'a5a4']);
    expect(games(black).at(-1)!.moves).toEqual(['b1a3', 'd7d5', 'a1b1']);
  });

  it("leaves one browser's game alone when another's grace period runs out", async () => {
    await build({ graceMs: 50 });
    const start = vi.spyOn(UciEngine, 'start');
    const leaver = await browserInGame();
    const stayer = await browserInGame();
    const [gone, kept] = await startedEngines(start);
    leaver.ws.terminate();

    await vi.waitFor(() => expect(gone!.alive).toBe(false));
    expect(kept!.alive).toBe(true);
    await playAndExpect(stayer, 'e2e4', 'a7a5');
  });

  it("leaves one browser's game alone when another's engine fails", async () => {
    await build();
    const failing = await connect(app, await pairedToken());
    const fine = await browserInGame();
    // The fake crashes on its first search of this position.
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    failing.send({ ...NEW_GAME, humanColor: 'black', fen });
    expect(await untilGameOrError(failing, 'over')).toMatchObject({
      game: { reason: expect.stringContaining('failed') as string },
    });
    await playAndExpect(fine, 'e2e4', 'a7a5');
  });

  it('stops every engine when the server shuts down', async () => {
    await build();
    const start = vi.spyOn(UciEngine, 'start');
    await browserInGame();
    await browserInGame();
    const engines = await startedEngines(start);
    expect(engines.map((engine) => engine.alive)).toEqual([true, true]);

    await app.close();
    expect(engines.map((engine) => engine.alive)).toEqual([false, false]);
  });

  it('refuses a new game at the limit of 4 engines, leaving the current game as it was', async () => {
    await build();
    const start = vi.spyOn(UciEngine, 'start');
    const playing = await browserInGame();
    await playAndExpect(playing, 'e2e4', 'a7a5');
    for (let i = 0; i < 3; i++) await browserInGame();
    const fifth = await connect(app, await pairedToken());
    expect(await fifth.next()).toMatchObject({ type: 'hello' });

    fifth.send(NEW_GAME);
    expect(await fifth.next()).toEqual(engineLimitError(4));
    playing.send(NEW_GAME);
    // The browser blanks its game on asking for a new one, so the game comes back, then the reason.
    expect(await playing.next()).toMatchObject({
      type: 'game',
      game: { phase: 'human', moves: ['e2e4', 'a7a5'] },
    });
    expect(await playing.next()).toMatchObject({ type: 'search' });
    expect(await playing.next()).toEqual(engineLimitError(4));
    expect(start).toHaveBeenCalledTimes(4);

    await playAndExpect(playing, 'd2d4', 'a5a4');
  });

  it('starts no engine for a message that arrives after shutdown', async () => {
    const start = vi.spyOn(UciEngine, 'start');
    const controller = new Controller({
      profiles: [fakeProfile('legal')],
      graceMs: 60_000,
      engineLimit: 1,
      log: () => {},
    });
    const connection = { address: ADDRESS, send: () => {}, close: () => {} };
    controller.attach('token', connection);
    await controller.release();

    controller.receive(connection, NEW_GAME as ClientMessage);
    expect(start).not.toHaveBeenCalled();
  });

  it('starts no engine, so needs no slot, for a game that is already over', async () => {
    await build({ engineLimit: 1 });
    await browserInGame();
    const other = await connect(app, await pairedToken());
    other.send({ ...NEW_GAME, fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' });
    expect(await other.next()).toMatchObject({ type: 'hello' });
    expect(await other.next()).toMatchObject({ type: 'game', game: { phase: 'starting' } });
    expect(await other.next()).toMatchObject({ type: 'game', game: { phase: 'over' } });
  });

  it('holds a slot until the engine has exited, not just been told to quit', async () => {
    await build({
      engineLimit: 1,
      graceMs: 20,
      profiles: [fakeProfile('ignore-quit')],
      engineTimeouts: { stopGraceMs: 1000 },
    });
    const start = vi.spyOn(UciEngine, 'start');
    const quit = vi.spyOn(UciEngine.prototype, 'quit');
    const leaver = await browserInGame();
    const engine = (await start.mock.results[0]!.value) as UciEngine;
    const waiting = await connect(app, await pairedToken());
    expect(await waiting.next()).toMatchObject({ type: 'hello' });
    leaver.ws.terminate();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledOnce());

    expect(engine.alive).toBe(true);
    waiting.send(NEW_GAME);
    expect(await waiting.next()).toEqual(engineLimitError(1));

    expect(await startOnceSlotFree(waiting, 1)).toMatchObject({ game: { phase: 'starting' } });
    expect(engine.alive).toBe(false);
  });

  it.each([
    ['cannot be found', { executable: 'no-such-engine-executable' }],
    // Node's `spawn` throws for this rather than emitting 'error'.
    ['cannot be spawned at all', { executable: 'bad\0name' }],
    ['never finishes its handshake', fakeProfile('no-uciok')],
  ])('frees the slot of an engine that %s', async (_name, broken) => {
    await build({
      engineLimit: 1,
      engineTimeouts: { handshakeMs: 200 },
      profiles: [fakeProfile('legal'), { ...fakeProfile('legal'), ...broken, id: 'broken' }],
    });
    const client = await connect(app, await pairedToken());
    expect(await client.next()).toMatchObject({ type: 'hello' });
    client.send({ ...NEW_GAME, engineId: 'broken' });
    expect(await untilGameOrError(client, 'over')).toMatchObject({ type: 'game' });
    expect(await startOnceSlotFree(client, 1)).toMatchObject({ game: { phase: 'starting' } });
    expect(await client.yourMove()).toMatchObject({ phase: 'human' });
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
    // The whole transcript so far, replacing whatever the browser showed.
    expect(await second.transcript()).toMatchObject({
      reset: true,
      lines: expect.arrayContaining([
        { dir: 'sent', text: 'uci' },
        { dir: 'received', text: 'bestmove b1a3' },
      ]),
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
    const resumed = await again.next();
    expect(resumed).toMatchObject({ type: 'game', game: { limit: { depth: 1 } } });
    // The engine may answer before or after the reconnect; either way the game carries on.
    const answered =
      resumed.type === 'game' && resumed.game.phase === 'human'
        ? resumed.game
        : await again.yourMove();
    expect(answered).toMatchObject({ lastMove: 'a7a5' });
    again.ws.send(JSON.stringify({ type: 'move', uci: 'd2d4' }));
    expect(await again.yourMove()).toMatchObject({ lastMove: 'a5a4' });
  });

  it('holds the game past the grace period, restarting the engine for the next move', async () => {
    await build({ graceMs: 20 });
    const start = vi.spyOn(UciEngine, 'start');
    const { token, client } = await tokenInGame({ depth: 1 });
    await playAndExpect(client, 'e2e4', 'a7a5');
    const [stopped] = await startedEngines(start);
    client.ws.terminate();
    await vi.waitFor(() => expect(stopped!.alive).toBe(false));

    const { client: again, game } = await reconnect(token);
    expect(game).toMatchObject({ phase: 'human', moves: ['e2e4', 'a7a5'] });
    await playAndExpect(again, 'd2d4', 'a5a4');
    expect(start).toHaveBeenCalledTimes(2);
    const [, restarted] = await startedEngines(start);
    expect(restarted!.alive).toBe(true);
  });

  it('forgets a browser with no game when its grace period runs out', async () => {
    const lines: string[] = [];
    await build({ graceMs: 20, log: (text) => lines.push(text) });
    const token = await pairedToken();
    (await connect(app, token)).ws.terminate();
    await vi.waitFor(() => expect(lines.join()).toContain('no game to hold'));

    await connect(app, token);
    await vi.waitFor(() => expect(lines.join()).toContain('connected, no game started'));
    expect(lines.join()).not.toContain('reconnected');
  });

  it('lets a search finish when the grace period runs out during it, then stops the engine', async () => {
    await build({ graceMs: 20 });
    const start = vi.spyOn(UciEngine, 'start');
    const { token, client } = await tokenInGame(SLOW);
    const [engine] = await startedEngines(start);
    await moveAndLeave(client, 'e2e4');
    await vi.waitFor(() => expect(engine!.alive).toBe(false), { timeout: 5000 });

    const { client: again, game } = await reconnect(token);
    expect(game).toMatchObject({ phase: 'human', moves: ['e2e4', 'a7a5'] });
    await playAndExpect(again, 'd2d4', 'a5a4');
  });

  it('keeps the engine when the browser reconnects during that search', async () => {
    const lines: string[] = [];
    await build({ graceMs: 20, log: (text) => lines.push(text) });
    const start = vi.spyOn(UciEngine, 'start');
    const { token, client } = await tokenInGame(SLOW);
    await moveAndLeave(client, 'e2e4');
    await vi.waitFor(() => expect(lines.join()).toContain('grace period ran out'));

    const { client: again } = await reconnect(token);
    expect(await again.yourMove()).toMatchObject({ lastMove: 'a7a5' });
    await playAndExpect(again, 'd2d4', 'a5a4');
    expect(start).toHaveBeenCalledOnce();
    const [engine] = await startedEngines(start);
    expect(engine!.alive).toBe(true);
  });

  it('shows the result of a game the engine finished while the browser was away', async () => {
    await build({ graceMs: 20 });
    const start = vi.spyOn(UciEngine, 'start');
    const { token, client } = await tokenInGame(SLOW, BACK_RANK_FEN);
    const [engine] = await startedEngines(start);
    await moveAndLeave(client, 'b3b4');
    await vi.waitFor(() => expect(engine!.alive).toBe(false), { timeout: 5000 });

    const { game } = await reconnect(token);
    expect(game).toMatchObject({
      phase: 'over',
      result: 'black',
      termination: 'checkmate',
      lastMove: 'a8a1',
    });
  });

  it('ends the game with a reason when a restart fails', async () => {
    const profile = fakeProfile('legal');
    await build({ graceMs: 20, engineLimit: 1, profiles: [profile] });
    const start = vi.spyOn(UciEngine, 'start');
    const { token, client } = await tokenInGame({ depth: 1 });
    const [engine] = await startedEngines(start);
    client.ws.terminate();
    await vi.waitFor(() => expect(engine!.alive).toBe(false));
    const executable = profile.executable;
    profile.executable = 'no-such-engine-executable';

    const { client: again } = await reconnect(token);
    again.send({ type: 'move', uci: 'e2e4' });
    expect(await untilGameOrError(again, 'over')).toMatchObject({
      game: { reason: expect.stringContaining('failed') as string, moves: ['e2e4'] },
    });

    // The failed start gave its slot back.
    profile.executable = executable;
    expect(await startOnceSlotFree(again, 1)).toMatchObject({ game: { phase: 'starting' } });
    expect(await again.yourMove()).toMatchObject({ phase: 'human' });
  });

  describe('at the engine limit, with the engine stopped', () => {
    /** A browser whose engine has stopped, and another now holding the only slot. */
    async function heldAndBlocked(fen?: string) {
      await build({ graceMs: 20, engineLimit: 1 });
      const start = vi.spyOn(UciEngine, 'start');
      const { token, client } = await tokenInGame({ depth: 1 }, fen);
      const [stopped] = await startedEngines(start);
      client.ws.terminate();
      await vi.waitFor(() => expect(stopped!.alive).toBe(false));
      const blocker = await connect(app, await pairedToken());
      expect(await startOnceSlotFree(blocker, 1)).toMatchObject({ game: { phase: 'starting' } });
      await blocker.yourMove();
      const { client: held } = await reconnect(token);
      return { held, blocker };
    }

    it('refuses a move needing a restart without applying it, and takes it once a slot is free', async () => {
      const { held, blocker } = await heldAndBlocked();
      held.send({ type: 'move', uci: 'e2e4' });
      // The browser has moved the piece already, so the game comes back, then the reason.
      expect(await held.next()).toMatchObject({
        type: 'game',
        game: { phase: 'human', moves: [] },
      });
      expect(await held.next()).toEqual(engineLimitError(1));

      blocker.ws.terminate();
      for (;;) {
        held.send({ type: 'move', uci: 'e2e4' });
        const msg = await untilGameOrError(held, 'thinking');
        if (msg.type === 'game') break;
        expect(msg).toEqual(engineLimitError(1));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await held.yourMove()).toMatchObject({ moves: ['e2e4', 'a7a5'] });
    });

    it('still takes a move that ends the game, which needs no engine', async () => {
      const { held } = await heldAndBlocked(MATE_IN_ONE_FEN);
      held.send({ type: 'move', uci: 'a1a8' });
      expect(await untilGameOrError(held, 'over')).toMatchObject({
        type: 'game',
        game: { result: 'white', termination: 'checkmate' },
      });
    });
  });
});

describe('lifecycle log', () => {
  /** An app whose log lines land in the returned array. */
  async function buildLogged(options: Partial<AppOptions> = {}) {
    const lines: string[] = [];
    await build({ log: (text) => lines.push(text), ...options });
    return lines;
  }

  /** Waits for an entry reading `text` after its timestamp. */
  const logged = (lines: string[], text: string) =>
    vi.waitFor(() =>
      expect(lines.map((line) => /^\d{4}-\d\d-\d\dT[\d:.]+Z (.*)$/s.exec(line)?.[1])).toContain(
        text,
      ),
    );

  it('logs a browser connecting', async () => {
    const lines = await buildLogged();
    await connect(app, await pairedToken());
    await logged(lines, `${ADDRESS} connected, no game started`);
  });

  it('logs a browser refused for not being paired', async () => {
    const lines = await buildLogged();
    await (
      await connect(app, 'guess')
    ).closed;
    await logged(lines, `${ADDRESS} refused: not paired`);
  });

  it('logs a browser refused at the engine limit', async () => {
    const lines = await buildLogged({ engineLimit: 2 });
    await browserInGame();
    await browserInGame();
    const refused = await connect(app, await pairedToken(), OTHER_ADDRESS);
    refused.send(NEW_GAME);
    await logged(lines, `${OTHER_ADDRESS} refused: limit of 2 engines reached`);
  });

  it('logs a replaced connection, with no close line for the old socket', async () => {
    const lines = await buildLogged();
    const token = await pairedToken();
    const first = await connect(app, token);
    await connect(app, token, OTHER_ADDRESS);
    await first.closed;
    await logged(lines, `${ADDRESS} replaced by ${OTHER_ADDRESS}`);
    expect(lines.join('\n')).not.toContain('socket closed');
  });

  it('logs a close and a reconnect, without claiming a game that never started', async () => {
    const lines = await buildLogged();
    const token = await pairedToken();
    const first = await connect(app, token);
    first.ws.terminate();
    await logged(lines, `${ADDRESS} socket closed, grace period of 60000 ms started`);
    await connect(app, token);
    await logged(lines, `${ADDRESS} reconnected, no game started`);
  });

  it('logs a reconnect that resumes a game', async () => {
    const lines = await buildLogged();
    const token = await pairedToken();
    const first = await connect(app, token);
    first.ws.send(JSON.stringify(NEW_GAME));
    await first.yourMove();
    first.ws.terminate();
    await logged(lines, `${ADDRESS} socket closed, grace period of 60000 ms started`);
    await connect(app, token);
    await logged(lines, `${ADDRESS} reconnected, resumed the game`);
  });

  it('logs the grace period running out', async () => {
    const lines = await buildLogged({ graceMs: 20 });
    const first = await connect(app, await pairedToken());
    first.ws.send(JSON.stringify(NEW_GAME));
    await first.yourMove();
    first.ws.terminate();
    await logged(lines, `${ADDRESS} grace period ran out, engine stopped, game held`);
  });

  it('logs the grace period running out during a search', async () => {
    const lines = await buildLogged({ graceMs: 20 });
    const { client } = await tokenInGame(SLOW);
    await moveAndLeave(client, 'e2e4');
    await logged(lines, `${ADDRESS} grace period ran out, engine stops once idle, game held`);
  });

  it('does not claim the grace period ran out when the server shuts down', async () => {
    const lines = await buildLogged({ graceMs: 20 });
    const first = await connect(app, await pairedToken());
    first.ws.send(JSON.stringify(NEW_GAME));
    await first.yourMove();
    await app.close();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(lines.join('\n')).not.toContain('grace period ran out');
  });

  it('never logs the token', async () => {
    const lines = await buildLogged({ graceMs: 20, engineLimit: 1 });
    const token = await pairedToken();
    const first = await connect(app, token);
    first.ws.send(JSON.stringify(NEW_GAME));
    await first.yourMove();
    const otherToken = await pairedToken();
    const refused = await connect(app, otherToken, OTHER_ADDRESS);
    refused.send(NEW_GAME);
    await logged(lines, `${OTHER_ADDRESS} refused: limit of 1 engines reached`);
    const second = await connect(app, token);
    await first.closed;
    await (
      await connect(app, 'guess-at-a-token')
    ).closed;
    second.ws.terminate();
    await logged(lines, `${ADDRESS} grace period ran out, engine stopped, game held`);
    const output = lines.join('\n');
    expect(output).not.toContain(token);
    expect(output).not.toContain(otherToken);
    expect(output).not.toContain('guess-at-a-token');
  });
});
