// The human-vs-engine game: the server's position, whose turn it is, and the engine process that
// plays the other side.
import {
  canResign,
  applyUciMove,
  canTakeBack,
  outcome,
  parseStartFen,
  START_FEN,
  turn,
  type GameState,
  type NewGameRequest,
  type SearchUpdate,
  type ServerMessage,
  type TranscriptLine,
} from '@stratchess-ui/shared';
import type { EngineProfile } from '../engines/profiles.ts';
import { EngineError, SearchCancelledError, UciEngine, type Timeouts } from '../uci/engine.ts';
import type { SearchInfo } from '../uci/protocol.ts';
import type { EngineSlots } from './engine-slots.ts';
import { searchReport } from './search-report.ts';
import { Throttle } from './throttle.ts';
import { TranscriptFeed } from './transcript.ts';

export type SessionOptions = {
  profiles: readonly EngineProfile[];
  /** Shared with every other browser's session. */
  slots: EngineSlots;
  send: (msg: ServerMessage) => void;
  /** A request turned away for lack of an engine slot, for the log. */
  refused: (reason: string) => void;
  timeouts?: Partial<Timeouts>;
  /** Where the build each game runs against, and engine failures with transcripts, are reported. */
  log: (text: string) => void;
};

type Game = {
  state: GameState;
  profile: EngineProfile;
  /** Every position of the game as a FEN, for repetition. */
  positions: string[];
  /** Absent while starting, and while a held game's engine is stopped until its next search. */
  engine?: UciEngine;
  /** A held game's restart under way, shared by a move replayed after a takeback. */
  engineStart?: Promise<boolean>;
  /** Nobody is connected and the grace period has run out: stop the engine at its next idle. */
  engineUnwanted: boolean;
  /** The last search line sent, resent to a browser that reattaches. */
  search?: SearchUpdate;
  transcript: TranscriptFeed;
};

const TRANSCRIPT_TAIL = 20;
const REPORT_INTERVAL_MS = 100;

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

  get search(): SearchUpdate | undefined {
    return this.game?.search;
  }

  /** The current game's transcript, for a browser that reattaches. */
  takeTranscript(): TranscriptLine[] | undefined {
    return this.game?.transcript.takeAll();
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
    const { slots } = this.options;
    // Decided before the engine starts: asked to move in a finished position, it would answer
    // a null move, or fail to start for nothing.
    const ended = outcome([start.fen]);
    if (!ended && !slots.take()) return this.refuseAtLimit();
    this.endCurrent();
    const game: Game = {
      profile,
      engineUnwanted: false,
      state: {
        startFen: start.fen,
        fen: start.fen,
        humanColor: request.humanColor,
        engineName: profile.name,
        limit: request.limit,
        phase: 'starting',
        moves: [],
      },
      positions: [start.fen],
      // A replaced game's engine still logs its `quit`, which must not reach the browser.
      transcript: new TranscriptFeed((lines) => {
        if (this.game === game) this.options.send({ type: 'transcript', lines });
      }, REPORT_INTERVAL_MS),
    };
    this.game = game;
    this.options.send({ type: 'transcript', lines: [], reset: true });
    this.publish(game);
    if (ended) return this.finish(game, ended);
    if (await this.startEngine(game)) this.nextTurn(game);
  }

  move(uci: string): void {
    const game = this.game;
    if (!game) return this.error('no game in progress');
    if (game.state.phase === 'over') return this.error('the game is over');
    if (game.state.phase !== 'human') return this.error('not your turn');
    const result = applyUciMove(game.state.fen, uci);
    if (!result.ok) return this.error(result.reason);
    // Refused before the move is applied, so the player can try it again: past here, a restart that
    // could not run would end the game.
    const needsRestart =
      !game.engine && !game.engineStart && !outcome([...game.positions, result.fen]);
    if (needsRestart && !this.options.slots.take()) return this.refuseAtLimit();
    this.play(game, result.uci, result.fen);
  }

  /**
   * Returns to the human's previous turn, which depends on the server's phase rather than the
   * browser's, so an Undo that crosses the engine's reply lands on the same turn. Any search is
   * cancelled; the engine otherwise stays as it is, as each search sends it the whole game.
   */
  takeBack(): void {
    const game = this.game;
    if (!game) return this.error('no game in progress');
    if (game.state.phase === 'over') return this.error('the game is over');
    if (!canTakeBack(game.state)) return this.error('nothing to take back');
    const plies = game.state.phase === 'thinking' ? 1 : 2;
    const moves = game.state.moves.slice(0, -plies);
    game.positions.length -= plies;
    game.search = undefined;
    game.state = {
      ...game.state,
      phase: 'human',
      fen: game.positions.at(-1)!,
      moves,
      lastMove: moves.at(-1),
    };
    void game.engine?.stop();
    this.publish(game);
  }

  /** Only the human resigns. Ending the game quits the engine, which cancels any search. */
  resign(): void {
    const game = this.game;
    if (!game) return this.error('no game in progress');
    if (game.state.phase === 'over') return this.error('the game is over');
    if (!canResign(game.state)) return this.error('the game has not started');
    const result = game.state.humanColor === 'white' ? 'black' : 'white';
    this.finish(game, { result, termination: 'resignation' });
  }

  /**
   * Stops the engine of a game nobody is connected to, freeing its slot and keeping the game. A
   * search is left to finish, which `maxSearchMs` bounds: `quit` would cancel it, and a cancelled
   * search plays no move, leaving the game thinking for good. Returns whether the engine has
   * already been told to stop, rather than at its next idle.
   */
  stopEngineWhenIdle(): boolean {
    const game = this.game;
    if (!game) return true;
    game.engineUnwanted = true;
    const busy =
      game.state.phase === 'starting' || game.state.phase === 'thinking' || !!game.engineStart;
    if (!busy) this.stopEngine(game);
    return !busy;
  }

  /** Someone is connected again, so an engine not yet stopped stays. */
  keepEngine(): void {
    if (this.game) this.game.engineUnwanted = false;
  }

  /** Ends the game, stopping its engine. */
  async close(): Promise<void> {
    this.game?.transcript.cancel();
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
    else if (game.engineUnwanted) this.stopEngine(game);
  }

  /** Starts the game's engine in a slot the caller has taken; false if the game has moved on. */
  private async startEngine(game: Game): Promise<boolean> {
    const { profile } = game;
    let engine: UciEngine;
    try {
      engine = await UciEngine.start(
        profile,
        this.options.timeouts,
        (line) => game.transcript.push(line),
        () => this.options.slots.free(),
      );
    } catch (error) {
      this.fail(game, error);
      return false;
    }
    if (this.game !== game) {
      void engine.quit(); // replaced or closed while starting
      return false;
    }
    game.engine = engine;
    this.options.log(`${profile.name}: running ${engine.name ?? 'an engine with no id name'}`);
    if (engine.name) game.state = { ...game.state, engineIdName: engine.name };
    return true;
  }

  /** Restarts a held game's engine; false if the turn it was for is gone by the time it is up. */
  private async restartForTurn(game: Game): Promise<boolean> {
    const { moves } = game.state;
    game.engineStart ??= this.startEngine(game).finally(() => {
      game.engineStart = undefined;
    });
    if (!(await game.engineStart)) return false;
    const { phase } = game.state;
    // Every move and takeback makes a new array. Taken back during the restart, a search now would
    // play the engine's move for the human; a replayed move waits on the same restart. Resigning
    // leaves the moves alone.
    if (game.state.moves === moves && phase !== 'over') return true;
    if (phase === 'over' || (phase === 'human' && game.engineUnwanted)) this.stopEngine(game);
    return false;
  }

  private stopEngine(game: Game): void {
    void game.engine?.quit();
    game.engine = undefined;
  }

  private async engineMove(game: Game): Promise<void> {
    if (!game.engine && !(await this.restartForTurn(game))) return;
    const fen = game.state.fen;
    const feed = new Throttle<SearchInfo>(
      (info) => this.report(game, fen, info),
      REPORT_INTERVAL_MS,
    );
    let bestMove: string;
    try {
      // The whole game rather than the position alone, so the engine can see repetitions.
      ({ bestMove } = await game.engine!.search(
        { fen: game.state.startFen, moves: game.state.moves, limit: game.state.limit },
        (info) => {
          // A line without a score (a future currmove line) would blank the display.
          if (info.score) feed.push(info);
        },
      ));
    } catch (error) {
      feed.cancel();
      if (!(error instanceof SearchCancelledError)) this.fail(game, error);
      return;
    }
    // The final line goes out before the move it led to.
    feed.flush();
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
    // An engine that dies being quit must not rewrite how the game ended.
    if (this.game !== game || game.state.phase === 'over') return;
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
    this.game?.transcript.cancel();
    const engine = this.game?.engine;
    this.game = undefined;
    void engine?.quit();
  }

  private report(game: Game, fen: string, info: SearchInfo): void {
    // A throttled line can outlive its search, cancelled by a takeback.
    if (this.game !== game || game.state.fen !== fen) return;
    game.search = { fen, info: searchReport(fen, info) };
    this.options.send({ type: 'search', ...game.search });
  }

  private publish(game: Game): void {
    // The lines that led to this state, such as a `bestmove`, go out before it.
    game.transcript.flush();
    this.options.send({ type: 'game', game: game.state });
  }

  private refuseAtLimit(): void {
    const reason = `limit of ${this.options.slots.limit} engines reached`;
    this.options.refused(reason);
    // The browser has blanked its game to ask for a new one, or moved the piece, so it needs this
    // one back. The error comes last, as a game state clears the browser's notice.
    if (this.game) {
      this.options.send({ type: 'game', game: this.game.state });
      if (this.game.search) this.options.send({ type: 'search', ...this.game.search });
    }
    this.error(`${reason}, try again later`);
  }

  private error(reason: string): void {
    this.options.send({ type: 'error', reason });
  }
}
