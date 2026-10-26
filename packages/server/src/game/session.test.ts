import { afterEach, describe, expect, it } from 'vitest';
import {
  sanMoves,
  START_FEN,
  type GameState,
  type NewGameRequest,
  type ServerMessage,
} from '@stratchess-ui/shared';
import { fakeProfile } from '../uci/fake-profile.ts';
import { GameSession } from './session.ts';

const PROFILES = ['legal', 'normal', 'crash-on-go', 'no-uciok'].map((mode) => ({
  ...fakeProfile(mode),
  id: mode,
}));
// A cold Node spawn of the fake can take well over 300 ms on a Windows CI runner.
const TIMEOUTS = { handshakeMs: 2000, readyMs: 1000, stopGraceMs: 300 };

let session: GameSession | undefined;
afterEach(async () => {
  await session?.close();
  session = undefined;
});

/** A session whose messages queue up until a test waits for them. */
function open(timeouts = TIMEOUTS) {
  const queue: ServerMessage[] = [];
  const waiting: ((m: ServerMessage) => void)[] = [];
  const logged: string[] = [];
  session = new GameSession({
    profiles: PROFILES,
    timeouts,
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
  /** Every message up to and including the next settled game state. */
  const untilSettled = async (): Promise<ServerMessage[]> => {
    const messages: ServerMessage[] = [];
    for (;;) {
      const msg = await next();
      messages.push(msg);
      if (msg.type === 'game' && msg.game.phase !== 'starting' && msg.game.phase !== 'thinking')
        return messages;
    }
  };
  return { session, next, settled, untilSettled, logged };
}

const searches = (messages: ServerMessage[]) => messages.filter((m) => m.type === 'search');

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
    const started = await settled();
    expect(started.reason).toBeUndefined();
    expect(started).toMatchObject({ phase: 'human', humanColor: 'white' });

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
    expect(await settled()).toMatchObject({
      phase: 'over',
      result: 'white',
      termination: 'checkmate',
      lastMove: 'h5f7',
    });
  });

  it('draws by threefold repetition without a claim', async () => {
    const { session, settled } = open();
    void session.newGame(game('legal', 'black'));
    await settled();
    // The fake opens b1a3, then shuffles its rook between a1 and b1. Its first rook move loses
    // white's queenside castling, so the position after it is the first of the three.
    const moves = ['g8f6', 'f6g8', 'g8f6', 'f6g8', 'g8f6'];
    let state: GameState | undefined;
    for (const move of moves) {
      expect(state?.phase ?? 'human').toBe('human');
      session.move(move);
      state = await settled();
    }
    expect(state).toMatchObject({
      phase: 'over',
      result: 'draw',
      termination: 'threefold repetition',
      lastMove: 'a1b1',
    });
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

  it('reports the moves in order, castling, en passant and promotion included', async () => {
    const { session, settled } = open();
    void session.newGame(game('legal', 'white'));
    await settled();
    // Against the fake's first legal moves: c7c5 lands beside the b5 pawn, which takes it en
    // passant, and the c-pawn then runs through to b8.
    const line = ['b2b4', 'b4b5', 'g1f3', 'e2e3', 'f1e2', 'b5c6', 'e1h1', 'c6c7', 'c7b8q'];
    let state: GameState | undefined;
    for (const move of line) {
      session.move(move);
      state = await settled();
    }
    expect(state!.moves).toEqual([
      ...['b2b4', 'a7a5', 'b4b5', 'a5a4', 'g1f3', 'a4a3', 'e2e3', 'b7b6', 'f1e2', 'c7c5'],
      ...['b5c6', 'b6b5', 'e1g1', 'b5b4', 'c6c7', 'b4b3', 'c7b8q', 'b3a2'],
    ]);
    expect(sanMoves(START_FEN, state!.moves)).toEqual([
      ...['b4', 'a5', 'b5', 'a4', 'Nf3', 'a3', 'e3', 'b6', 'Be2', 'c5'],
      ...['bxc6', 'b5', 'O-O', 'b4', 'c7', 'b3', 'cxb8=Q', 'bxa2'],
    ]);
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
    const { session, settled } = open({ ...TIMEOUTS, handshakeMs: 300 });
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

  describe('search info', () => {
    it("reports the engine's search as white sees it, PV in SAN, when the engine is white", async () => {
      const { session, untilSettled } = open();
      void session.newGame(game('legal', 'black'));
      const messages = await untilSettled();
      const reports = searches(messages);
      expect(reports[0]).toEqual({
        type: 'search',
        fen: START_FEN,
        info: { depth: 1, score: { cp: 35 }, nodes: 34, pv: ['d4'] },
      });
      // The final line, sent before the move it led to.
      expect(messages.at(-2)).toEqual({
        type: 'search',
        fen: START_FEN,
        info: { depth: 3, score: { cp: 25 }, nodes: 2136, pv: ['Nc3'] },
      });
    });

    it("reports the engine's search as white sees it, PV in SAN, when the engine is black", async () => {
      const { session, settled, untilSettled } = open();
      void session.newGame(game('legal', 'white'));
      await settled();
      session.move('e2e4');
      const messages = await untilSettled();
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
      expect(searches(messages)[0]).toEqual({
        type: 'search',
        fen,
        info: { depth: 1, score: { cp: -35 }, nodes: 34, pv: ['a5'] },
      });
      expect(messages.at(-2)).toEqual({
        type: 'search',
        fen,
        info: { depth: 3, score: { cp: -25 }, nodes: 2136, pv: ['a5'] },
      });
    });

    it('forwards nothing from a search a new game cancelled', async () => {
      const { session, next, untilSettled } = open();
      // A move-time search: the fake reports its iterations at once, then sleeps until stopped.
      void session.newGame({ ...game('legal', 'black'), limit: { movetimeMs: 60_000 } });
      let msg: ServerMessage;
      do msg = await next();
      while (msg.type !== 'search');

      void session.newGame(game('legal', 'white'));
      const messages = await untilSettled();
      expect(messages[0]).toMatchObject({ game: { phase: 'starting', humanColor: 'white' } });
      expect(searches(messages)).toEqual([]);
      expect(session.search).toBeUndefined();
    });
  });

  describe('from a FEN', () => {
    // A lone white pawn; e3 is no en passant square any black pawn could use.
    const ENDING = '4k3/8/8/8/4P3/8/8/4K3 b - e3 0 40';

    it('plays on from the position, the engine moving first when it is to move', async () => {
      const { session, next, settled } = open();
      void session.newGame({
        ...game('legal', 'white'),
        fen: `  ${ENDING}
`,
      });
      expect(await next()).toMatchObject({
        game: { phase: 'starting', startFen: '4k3/8/8/8/4P3/8/8/4K3 b - - 0 40' },
      });
      const started = await settled();
      expect(started).toMatchObject({ phase: 'human', moves: [started.lastMove] });
      expect(started.lastMove).toMatch(/^e8/);

      // The fake replays the start FEN and the moves; from the standard position, e4e5 is illegal.
      session.move('e4e5');
      const state = await settled();
      expect(state.phase).toBe('human');
      expect(state.moves).toHaveLength(3);
      expect(state.fen).toMatch(/ w - - \d+ 42$/);
    });

    it('sends the engine the FEN normalised, never as typed', async () => {
      // The fake that crashes on go leaves its transcript, position command included, in the log.
      const { session, settled, logged } = open();
      void session.newGame({ ...game('crash-on-go', 'white'), fen: ENDING });
      expect((await settled()).phase).toBe('over');
      expect(logged[0]).toContain('> position fen 4k3/8/8/8/4P3/8/8/4K3 b - - 0 40');
    });

    it('refuses an invalid FEN with a reason and keeps the current game', async () => {
      const { session, next, settled } = open();
      void session.newGame(game('legal', 'white'));
      await settled();
      for (const [fen, reason] of [
        ['not/a/fen', 'invalid FEN: the board part is malformed'],
        ['4k3/8/8/8/8/8/8/8 w - - 0 1', 'illegal position: each side needs exactly one king'],
        ['4k3/8/8/8/8/8/8/4RK2 w - - 0 1', 'illegal position: the side not to move is in check'],
        ['', 'invalid FEN: empty'],
      ]) {
        void session.newGame({ ...game('legal', 'black'), fen });
        expect(await next()).toEqual({ type: 'error', reason });
      }
      session.move('e2e4');
      expect(await settled()).toMatchObject({ humanColor: 'white', lastMove: 'a7a5' });
    });

    it('ends a game that is already decided at once, without starting the engine', async () => {
      // An engine that never completes its handshake would end the game with a failure instead.
      const { session, next, logged } = open();
      for (const [fen, ended] of [
        ['R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 30', { result: 'white', termination: 'checkmate' }],
        ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 60', { result: 'draw', termination: 'stalemate' }],
        ['8/8/8/4k3/8/8/4K3/R7 w - - 100 80', { result: 'draw', termination: 'fifty-move rule' }],
      ] as const) {
        void session.newGame({ ...game('no-uciok', 'white'), fen });
        expect(await next()).toMatchObject({ game: { phase: 'starting' } });
        expect(await next()).toMatchObject({ game: { phase: 'over', ...ended } });
      }
      expect(logged).toEqual([]);
    });
  });
});
