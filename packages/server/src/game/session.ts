// The human-vs-engine game: the server's position, whose turn it is, and the engine process that
// plays the other side.
import {
  applyUciMove,
  outcome,
  parseStartFen,
  START_FEN,
  turn,
  type GameState,
  type NewGameRequest,
  type SearchLimit,
  type ServerMessage,
} from '@stratchess-ui/shared';
import type { EngineProfile } from '../engines/profiles.ts';
import { EngineError, SearchCancelledError, UciEngine, type Timeouts } from '../uci/engine.ts';

export type SessionOptions = {
  profiles: readonly EngineProfile[];
  send: (msg: ServerMessage) => void;
  timeouts?: Partial<Timeouts>;
  /** Where engine failures and their transcripts are reported. */
  log: (text: string) => void;
};

type Game = {
  state: GameState;
  /** Every position of the game as a FEN, for repetition. */
  positions: string[];
  limit: SearchLimit;
  engine?: UciEngine;
};

const TRANSCRIPT_TAIL = 20;

export class GameSession {
  private readonly options: SessionOptions;
  /** The current game; an engine callback for any other game is stale and ignored. */
  private game?: Game;

  constructor(options: SessionOptions) {
    this.options = options;
  }

  get state(): GameState | undefined {
    return this.game?.state;
  }

  /**
   * Replaces any current game, starting the profile's engine and asking it to move if it is to
   * move. An invalid request leaves the current game as it was.
   */
  async newGame(request: NewGameRequest): Promise<void> {
    const profile = this.options.profiles.find((p) => p.id === request.engineId);
    if (!profile) return this.error(`unknown engine: ${request.engineId}`);
    const start = parseStartFen(request.fen ?? START_FEN);
    if (!start.ok) return this.error(start.reason);
    this.endCurrent();
    const game: Game = {
      state: {
        startFen: start.fen,
        fen: start.fen,
        humanColor: request.humanColor,
        engineName: profile.name,
        phase: 'starting',
        moves: [],
      },
      positions: [start.fen],
      limit: request.limit,
    };
    this.game = game;
    this.publish(game);
    // Decided before the engine starts: asked to move in a finished position, it would answer
    // a null move, or fail to start for nothing.
    const ended = outcome(game.positions);
    if (ended) return this.finish(game, ended);
    let engine: UciEngine;
    try {
      engine = await UciEngine.start(profile, this.options.timeouts);
    } catch (error) {
      return this.fail(game, error);
    }
    if (this.game !== game) return void engine.quit(); // replaced or closed while starting
    game.engine = engine;
    this.nextTurn(game);
  }

  move(uci: string): void {
    const game = this.game;
    if (!game) return this.error('no game in progress');
    if (game.state.phase === 'over') return this.error('the game is over');
    if (game.state.phase !== 'human') return this.error('not your turn');
    const result = applyUciMove(game.state.fen, uci);
    if (!result.ok) return this.error(result.reason);
    this.play(game, result.uci, result.fen);
  }

  /** Ends the game, stopping its engine. */
  async close(): Promise<void> {
    const engine = this.game?.engine;
    this.game = undefined;
    await engine?.quit();
  }

  private play(game: Game, uci: string, fen: string): void {
    game.positions.push(fen);
    game.state = { ...game.state, fen, moves: [...game.state.moves, uci], lastMove: uci };
    this.nextTurn(game);
  }

  private nextTurn(game: Game): void {
    const ended = outcome(game.positions);
    if (ended) return this.finish(game, ended);
    const humanToMove = turn(game.state.fen) === game.state.humanColor;
    game.state = { ...game.state, phase: humanToMove ? 'human' : 'thinking' };
    this.publish(game);
    if (!humanToMove) void this.engineMove(game);
  }

  private async engineMove(game: Game): Promise<void> {
    let bestMove: string;
    try {
      // The whole game rather than the position alone, so the engine can see repetitions.
      ({ bestMove } = await game.engine!.search({
        fen: game.state.startFen,
        moves: game.state.moves,
        limit: game.limit,
      }));
    } catch (error) {
      if (!(error instanceof SearchCancelledError)) this.fail(game, error);
      return;
    }
    if (this.game !== game) return;
    // The engine is not trusted: its move goes through the same rules as the human's.
    const result = applyUciMove(game.state.fen, bestMove);
    if (!result.ok) {
      return this.finish(game, {
        reason: `${game.state.engineName} played an illegal move: ${bestMove}`,
      });
    }
    this.play(game, result.uci, result.fen);
  }

  private fail(game: Game, error: unknown): void {
    if (this.game !== game) return;
    const message = (error as Error).message;
    const transcript = error instanceof EngineError ? error.transcript.slice(-TRANSCRIPT_TAIL) : [];
    this.options.log([`${game.state.engineName}: ${message}`, ...transcript].join('\n'));
    this.finish(game, { reason: `${game.state.engineName} failed: ${message}` });
  }

  private finish(game: Game, end: Pick<GameState, 'result' | 'termination' | 'reason'>): void {
    game.state = { ...game.state, ...end, phase: 'over' };
    this.publish(game);
    void game.engine?.quit();
  }

  private endCurrent(): void {
    const engine = this.game?.engine;
    this.game = undefined;
    void engine?.quit();
  }

  private publish(game: Game): void {
    this.options.send({ type: 'game', game: game.state });
  }

  private error(reason: string): void {
    this.options.send({ type: 'error', reason });
  }
}
