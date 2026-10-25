import { afterEach, describe, expect, it } from 'vitest';
import type { GameState, NewGameRequest, ServerMessage } from '@stratchess-ui/shared';
import { fakeProfile } from '../uci/fake-profile.ts';
import { GameSession } from './session.ts';

const PROFILES = ['legal', 'normal', 'crash-on-go', 'no-uciok'].map((mode) => ({
  ...fakeProfile(mode),
  id: mode,
}));
const TIMEOUTS = { handshakeMs: 300, readyMs: 1000, stopGraceMs: 300 };

let session: GameSession | undefined;
afterEach(async () => {
  await session?.close();
  session = undefined;
});

/** A session whose messages queue up until a test waits for them. */
function open() {
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  const logged: string[] = [];
  session = new GameSession({
    profiles: PROFILES,
    timeouts: TIMEOUTS,
    log: (text) => logged.push(text),
    send: (msg) => {
      const resolve = waiting.shift();
      if (resolve) resolve(msg);
      else queue.push(msg);
    },
  });
  const next = () =>
    new Promise<ServerMessage>((resolve) => {
      const msg = queue.shift();
      if (msg) resolve(msg);
      else waiting.push(resolve);
    });
  /** The next game state that has left the starting and thinking phases. */
  const settled = async (): Promise<GameState> => {
    for (;;) {
      const msg = await next();
      if (msg.type === 'error') throw new Error(`unexpected error: ${msg.reason}`);
      if (msg.type === 'game' && msg.game.phase !== 'starting' && msg.game.phase !== 'thinking')
        return msg.game;
    }
  };
  return { session, next, settled, logged };
}

const game = (engineId: string, humanColor: NewGameRequest['humanColor']): NewGameRequest => ({
  engineId,
  humanColor,
  limit: { depth: 3 },
});

describe('GameSession', () => {
  it('plays a scripted game as white through to checkmate', async () => {
    const { session, next, settled } = open();
    void session.newGame(game('legal', 'white'));
    expect(await next()).toMatchObject({ type: 'game', game: { phase: 'starting' } });
    expect(await settled()).toMatchObject({ phase: 'human', humanColor: 'white' });

    // The fake answers its first legal move, which never defends f7.
    const replies: string[] = [];
    for (const move of ['e2e4', 'f1c4', 'd1h5']) {
      session.move(move);
      expect(await next()).toMatchObject({ game: { phase: 'thinking', lastMove: move } });
      const state = await settled();
      expect(state.phase).toBe('human');
      replies.push(state.lastMove!);
    }
    expect(replies).toEqual(['a7a5', 'a5a4', 'a4a3']);

    session.move('h5f7');
    expect(await settled()).toMatchObject({ phase: 'over', result: 'white', lastMove: 'h5f7' });
  });

  it('lets the engine open when the human plays black', async () => {
    const { session, next, settled } = open();
    void session.newGame(game('legal', 'black'));
    expect(await next()).toMatchObject({ game: { phase: 'starting', humanColor: 'black' } });
    expect(await next()).toMatchObject({ game: { phase: 'thinking' } });
    expect(await settled()).toMatchObject({ phase: 'human', lastMove: 'b1a3' });

    session.move('e7e5');
    expect(await next()).toMatchObject({ game: { phase: 'thinking', lastMove: 'e7e5' } });
    const state = await settled();
    expect(state).toMatchObject({ phase: 'human', lastMove: 'a1b1' });
    expect(state.fen.split(' ')[1]).toBe('b');
  });

  it('sends castling to the engine in standard UCI, whichever square the board used', async () => {
    const { session, next, settled } = open();
    void session.newGame(game('legal', 'white'));
    await settled();
    for (const move of ['e2e4', 'g1f3', 'f1c4']) {
      session.move(move);
      await settled();
    }
    // Chessground lets the king be dropped on its rook; StratChess rejects e1h1.
    session.move('e1h1');
    expect(await next()).toMatchObject({ game: { phase: 'thinking', lastMove: 'e1g1' } });
    const state = await settled();
    expect(state.phase).toBe('human');
    expect(state.fen).toMatch(/\/RNBQ1RK1 w kq /);
  });

  it('refuses a move out of turn or against the rules', async () => {
    const { session, next, settled } = open();
    session.move('e2e4');
    expect(await next()).toEqual({ type: 'error', reason: 'no game in progress' });

    void session.newGame(game('legal', 'white'));
    await settled();
    session.move('e2e5');
    expect(await next()).toEqual({ type: 'error', reason: 'illegal move: e2e5' });
    session.move('e2e4');
    await next(); // thinking
    session.move('d2d4');
    expect(await next()).toEqual({ type: 'error', reason: 'not your turn' });
  });

  it('ends the game when the engine plays an illegal move', async () => {
    const { session, settled } = open();
    // Normal mode answers g8f6 to any move list, which is not a move for white.
    void session.newGame(game('normal', 'black'));
    expect(await settled()).toMatchObject({ lastMove: 'b1c3' });
    session.move('e7e5');
    expect(await settled()).toMatchObject({
      phase: 'over',
      reason: 'StratChess (fake) played an illegal move: g8f6',
    });
  });

  it('ends the game with a reason when the engine crashes', async () => {
    const { session, settled, logged } = open();
    void session.newGame(game('crash-on-go', 'black'));
    const state = await settled();
    expect(state.phase).toBe('over');
    expect(state.reason).toMatch(/^StratChess \(fake\) failed: engine exited \(code 3\)/);
    expect(logged[0]).toContain('> go depth 3');
  });

  it('ends the game with a reason when the engine does not start', async () => {
    const { session, settled } = open();
    void session.newGame(game('no-uciok', 'white'));
    expect((await settled()).reason).toMatch(/failed: timed out .* waiting for uciok/);
  });

  it('refuses an engine the host does not offer', async () => {
    const { session, next } = open();
    void session.newGame(game('stockfish', 'white'));
    expect(await next()).toEqual({ type: 'error', reason: 'unknown engine: stockfish' });
  });

  it('replaces a game whose engine is still thinking', async () => {
    const { session, next, settled } = open();
    void session.newGame({ ...game('legal', 'black'), limit: { movetimeMs: 60_000 } });
    await next(); // starting
    expect(await next()).toMatchObject({ game: { phase: 'thinking' } });

    void session.newGame(game('legal', 'white'));
    expect(await next()).toMatchObject({ game: { phase: 'starting', humanColor: 'white' } });
    expect(await settled()).toMatchObject({ phase: 'human', humanColor: 'white' });
    session.move('e2e4');
    await next(); // thinking
    // Only the new game's engine answers; the replaced one was stopped with its game.
    expect(await settled()).toMatchObject({ humanColor: 'white', lastMove: 'a7a5' });
  });
});
