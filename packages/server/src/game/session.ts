// The human-vs-engine game: the server's position, whose turn it is, and the engine process that
// plays the other side.
import {
  applyUciMove,
  canHint,
  canResign,
  canTakeBack,
  outcome,
  parseStartFen,
  START_FEN,
  turn,
  type Feedback,
  type GameState,
  type Hint,
  type NewGameRequest,
  type Outcome,
  type SearchUpdate,
  type Score,
  type ServerMessage,
  type Strength,
  type TranscriptLine,
  type Verdict,
} from '@stratchess-ui/shared';
import type { EngineProfile } from '../engines/profiles.ts';
import { EngineError, SearchCancelledError, UciEngine, type Timeouts } from '../uci/engine.ts';
import type { SearchInfo } from '../uci/protocol.ts';
import type { EngineSlots } from './engine-slots.ts';
import {
  chooseMove,
  decidedCp,
  levelOf,
  rankMoves,
  resigns,
  scoreCp,
  surrenders,
  type Level,
} from './opponent.ts';
import { searchReport } from './search-report.ts';
import { Throttle } from './throttle.ts';
import { TranscriptFeed } from './transcript.ts';
import {
  ANALYSIS,
  bestVerdict,
  verdictOf,
  withoutOpeningPraise,
  withoutPraise,
} from './verdicts.ts';

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
  /** The beginner opponent's dice; `Math.random` unless a test needs them fixed. */
  rng?: () => number;
};

/** A move's score for the side to move on `scoreCp`'s scale, and as the browser sees it. */
type MoveScore = { cp: number; score: Score };

/**
 * An analysis search's best move, its score for the side to move on `scoreCp`'s scale, and the
 * score and PV as the browser sees them: from white's perspective, in SAN. A search that ranked two
 * lines adds the second-best move and its score.
 */
type Scored = MoveScore & { bestMove: string; pv: string[]; second?: MoveScore & { move: string } };

/** `null`: the search ran and gave nothing to judge a move by. Undefined: it was cancelled. */
type Analysed = Scored | null | undefined;

/**
 * The analysis behind verdicts and hints, run in the game's own engine between its turns: a plain
 * search, so neither inherits a level's deliberate mistakes.
 */
type Analysis = {
  /**
   * Each human turn's position search, by the number of moves before the turn. Kept past the turn,
   * so a takeback to it searches nothing and hints the same move.
   */
  best: Analysed[];
  /** The position search under way, which a move made meanwhile waits for. */
  running?: { ply: number; result: Promise<Analysed> };
  /** An analysis search has reached the engine since its hash was last cleared. */
  inHash: boolean;
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
  /**
   * The moves of the turn a level game is ranking. Its child searches stay out of the transcript:
   * at hundreds of lines a turn they would evict everything else, and a reattach would resend them.
   */
  rankingTurn?: readonly string[];
  /** A level game's turns in a row spent surrendering, towards resigning. */
  surrenderedTurns: number;
  /** Behind verdicts when `state.analysis` asks for them, and behind hints in any game. */
  searches: Analysis;
  /** The hint shown at each human turn, by the number of moves before the turn. */
  hints: (Hint | undefined)[];
  /**
   * The human turns whose best move MoveFeedback has shown, by the number of moves before the
   * turn. A takeback keeps them, so replaying that move earns no praise, as on a hinted turn.
   */
  revealed: boolean[];
  /** The moves of the turn a hint is being found for, which a second request must not overtake. */
  hinting?: readonly string[];
};

const TRANSCRIPT_TAIL = 20;
const REPORT_INTERVAL_MS = 100;
/** Deep enough to see a hanging piece or a mate in one, through quiescence at the horizon. */
const RANKING_LIMIT = { depth: 1 };
/** The PV a best move shows with: one line in the sidebar. */
const FEEDBACK_PV_PLIES = 8;
/** Per game rather than per turn: a beginner who needs one every turn wants an easier level. */
export const HINTS_PER_GAME = 3;

/**
 * Rank 2 of a search of `fen`, if its score can stand beside rank 1's: exact, and from the same
 * depth, as the last lines before `bestmove` are.
 */
function secondBest(fen: string, first: SearchInfo, second?: SearchInfo): Scored['second'] {
  const move = second?.pv?.[0];
  if (!second?.score || !move || second.bound || first.bound || second.depth !== first.depth)
    return;
  const { score } = searchReport(fen, second);
  return score && { move, cp: scoreCp(second.score), score };
}

/** The best move's row of MoveFeedback, from the position search of the move's turn. */
/**
 * The best move's line, for a move played instead that scored `playedCp` for its mover. A score
 * above the best's comes from another search, at another depth, so neither is wrong.
 */
function bestLine(best: Scored, playedCp: number | undefined): NonNullable<Feedback['best']> {
  const line = { score: best.score, pv: best.pv.slice(0, FEEDBACK_PV_PLIES) };
  return playedCp !== undefined && playedCp > best.cp ? { ...line, outscored: true } : line;
}

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
    const strength: Strength =
      'level' in request ? { level: request.level } : { limit: request.limit };
    if ('level' in strength && !profile.levels)
      return this.error(`${profile.name} does not play levels`);
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
      surrenderedTurns: 0,
      state: {
        startFen: start.fen,
        fen: start.fen,
        humanColor: request.humanColor,
        engineName: profile.name,
        ...strength,
        phase: 'starting',
        moves: [],
        ...(request.analysis && { analysis: true, verdicts: [], feedback: [] }),
        hintsLeft: HINTS_PER_GAME,
      },
      searches: { best: [], inHash: false },
      hints: [],
      revealed: [],
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
   * cancelled; the engine otherwise stays as it is, as each search sends it the whole game. The
   * verdicts go with their moves, and so do the hints, though not what they cost.
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
    game.surrenderedTurns = 0;
    // The turns after this one may be reached again by other moves.
    game.hints.length = Math.min(game.hints.length, moves.length + 1);
    game.revealed.length = Math.min(game.revealed.length, moves.length + 1);
    game.searches.best.length = Math.min(game.searches.best.length, moves.length + 1);
    game.searches.running = undefined;
    game.state = {
      ...game.state,
      phase: 'human',
      fen: game.positions.at(-1)!,
      moves,
      lastMove: moves.at(-1),
      ...(game.state.verdicts && { verdicts: game.state.verdicts.slice(0, -plies) }),
      ...(game.state.feedback && { feedback: game.state.feedback.slice(0, -plies) }),
      hint: game.hints[moves.length],
    };
    void game.engine?.stop();
    this.publish(game);
    this.analyseTurn(game);
  }

  /**
   * Shows the next stage of a hint for the human's turn: the engine's best move, from the turn's
   * position search. A held game's engine is restarted for it, as for a move.
   */
  hint(): void {
    const game = this.game;
    if (!game) return this.error('no game in progress');
    if (game.state.phase === 'over') return this.error('the game is over');
    if (game.state.phase !== 'human') return this.error('not your turn');
    if (!canHint(game.state)) {
      return this.error(game.state.hint ? 'the hint is already showing' : 'no hints left');
    }
    const { moves } = game.state;
    // A second tap while the first is searched would otherwise show both stages at once.
    if (game.hinting === moves) return;
    const needsRestart = this.hintNeedsEngine(game, moves.length) && !game.engineStart;
    if (needsRestart && !this.options.slots.take()) return this.refuseAtLimit();
    game.hinting = moves;
    void this.showHint(game, moves).finally(() => {
      if (game.hinting === moves) game.hinting = undefined;
    });
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
    const { moves, verdicts, feedback } = game.state;
    game.state = {
      ...game.state,
      fen,
      moves: [...moves, uci],
      lastMove: uci,
      ...(verdicts && { verdicts: [...verdicts, null] }),
      ...(feedback && { feedback: [...feedback, null] }),
      hint: undefined,
    };
    this.nextTurn(game);
  }

  private nextTurn(game: Game): void {
    const ended = outcome(game.positions);
    if (ended) {
      this.judgeDecidingMove(game, ended);
      return this.finish(game, ended);
    }
    const humanToMove = turn(game.state.fen) === game.state.humanColor;
    game.state = { ...game.state, phase: humanToMove ? 'human' : 'thinking' };
    this.publish(game);
    if (!humanToMove) void this.engineMove(game);
    else if (game.engineUnwanted) this.stopEngine(game);
    else this.analyseTurn(game);
  }

  /** Starts the game's engine in a slot the caller has taken; false if the game has moved on. */
  private async startEngine(game: Game): Promise<boolean> {
    const { profile } = game;
    let engine: UciEngine;
    try {
      engine = await UciEngine.start(
        profile,
        this.options.timeouts,
        (line) => {
          if (!game.rankingTurn) game.transcript.push(line);
        },
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
    // Its position search is cancelled, and may settle only after a restarted engine's move asks.
    game.searches.running = undefined;
  }

  /**
   * Whether the engine's turn that began with `moves` is gone: taken back, or the game over or
   * replaced. Every move and takeback makes a new array, as in `restartForTurn`.
   */
  private turnIsGone(game: Game, moves: readonly string[]): boolean {
    return this.game !== game || game.state.moves !== moves || game.state.phase !== 'thinking';
  }

  /**
   * Starts the position search of the human's turn while they think, in a game asked for verdicts;
   * any other game searches a turn only for a hint. Analysis never starts an engine: a held game's
   * turn is searched once its move, or a hint, has restarted one.
   */
  private analyseTurn(game: Game): void {
    if (game.state.analysis && game.engine)
      void this.positionSearch(game, game.searches, game.state.moves.length);
  }

  /** A turn searched before, as one returned to by a takeback, hints with no engine running. */
  private hintNeedsEngine(game: Game, ply: number): boolean {
    return game.searches.best[ply] === undefined && !game.engine;
  }

  /** Finds the hint for the turn that began with `moves` and shows its next stage. */
  private async showHint(game: Game, moves: readonly string[]): Promise<void> {
    const ply = moves.length;
    if (this.hintNeedsEngine(game, ply) && !(await this.restartForTurn(game))) return;
    const best = await this.positionSearch(game, game.searches, ply);
    // Moved, taken back or ended meanwhile: the game state that said so has answered the request.
    if (this.game !== game || game.state.moves !== moves || game.state.phase !== 'human') return;
    // A restart defers `stopEngineWhenIdle`, and no move follows here to honour it.
    if (game.engineUnwanted) this.stopEngine(game);
    // The engine is not trusted with the board's squares either.
    const move = best && applyUciMove(game.state.fen, best.bestMove);
    if (!move || !move.ok) return this.error('no hint for this position');
    const from = move.uci.slice(0, 2);
    const shown = game.hints[ply];
    const hint = shown ? { from, to: move.uci.slice(2, 4) } : { from };
    game.hints[ply] = hint;
    const hintsLeft = game.state.hintsLeft - (shown ? 0 : 1);
    game.state = { ...game.state, hint, hintsLeft };
    this.publish(game);
  }

  /** The position search of the human's turn after `ply` moves: kept, under way, or started now. */
  private positionSearch(game: Game, analysis: Analysis, ply: number): Promise<Analysed> {
    const kept = analysis.best[ply];
    if (kept !== undefined) return Promise.resolve(kept);
    if (analysis.running?.ply === ply) return analysis.running.result;
    const moves = game.state.moves.slice(0, ply);
    // Only a verdict needs the second-best move.
    const ranks = game.state.analysis ? 2 : 1;
    const running = {
      ply,
      result: this.analysisSearch(game, analysis, moves, ANALYSIS.depth, ranks).then((best) => {
        // Dropped by a takeback or with its engine, either of which cancelled it.
        if (analysis.running !== running) return undefined;
        analysis.running = undefined;
        if (best !== undefined) analysis.best[ply] = best;
        return best;
      }),
    };
    analysis.running = running;
    return running.result;
  }

  /**
   * Searches the game after `moves`, sending no search lines on: the eval bar is the opponent's.
   * Ranks up to `ranks` lines, as many as the engine can. A failure ends the game, as it would at
   * the opponent's turn.
   */
  private async analysisSearch(
    game: Game,
    analysis: Analysis,
    moves: readonly string[],
    depth: number,
    ranks = 1,
  ): Promise<Analysed> {
    const { startFen, engineName } = game.state;
    const fen = game.positions[moves.length]!;
    // Before the search, as one cancelled part-way has written to the hash too.
    analysis.inHash = true;
    const engine = game.engine!;
    let result;
    try {
      result = await engine.search({
        fen: startFen,
        moves,
        limit: { depth },
        capMs: ANALYSIS.capMs,
        multiPv: Math.min(ranks, engine.maxMultiPv),
      });
    } catch (error) {
      if (!(error instanceof SearchCancelledError)) this.fail(game, error);
      return undefined;
    }
    if (result.capped) {
      this.options.log(`${engineName}: analysis to depth ${depth} capped at ${ANALYSIS.capMs} ms`);
      return null;
    }
    const { info, bestMove } = result;
    if (!info?.score) return null;
    // The feedback names the best move by the PV's first, and an engine's PV need not lead with it.
    const pv = info.pv?.[0] === bestMove ? info.pv : [bestMove];
    const report = searchReport(fen, { ...info, pv });
    if (!report.score) return null;
    const second = secondBest(fen, info, result.second);
    return {
      bestMove,
      cp: scoreCp(info.score),
      score: report.score,
      pv: report.pv ?? [],
      ...(second && { second }),
    };
  }

  /**
   * Publishes the verdict on the move the human just made, ahead of the opponent's turn. A turn
   * with no position search yet, as after a restart, runs it first. False if the turn is gone by
   * the end.
   */
  private async judgeLastMove(game: Game, analysis: Analysis): Promise<boolean> {
    const { moves } = game.state;
    const ply = moves.length - 1;
    // The engine moves first.
    if (ply < 0) return true;
    const best = await this.positionSearch(game, analysis, ply);
    if (this.turnIsGone(game, moves)) return false;
    if (!best) return true;
    let verdict: Verdict | undefined = bestVerdict(best.cp, best.second?.cp);
    let feedback: Feedback = { score: best.score };
    if (moves[ply] !== best.bestMove) {
      const played = await this.playedScore(game, analysis, moves, best);
      if (this.turnIsGone(game, moves)) return false;
      verdict = played ? verdictOf(best.cp, played.cp) : undefined;
      feedback = { ...(played && { score: played.score }), best: bestLine(best, played?.cp) };
    }
    this.judge(game, ply, verdict, feedback);
    this.publish(game);
    return true;
  }

  /**
   * The score of the move that ended `moves`, not the best, for its mover: the second-best's from
   * the position search when it is that move, as the gap that made the best great must match the
   * verdict on the second, or else a reply search's. Null when the reply search gave nothing.
   */
  private async playedScore(
    game: Game,
    analysis: Analysis,
    moves: readonly string[],
    best: Scored,
  ): Promise<MoveScore | null | undefined> {
    if (best.second?.move === moves.at(-1)) return best.second;
    const reply = await this.analysisSearch(game, analysis, moves, ANALYSIS.depth - 1);
    return reply && { cp: -reply.cp, score: reply.score };
  }

  /**
   * The verdict on a move that ended the game, whose score the rules give. Only with the position
   * search already in: ending the game stops the engine.
   */
  private judgeDecidingMove(game: Game, ended: Outcome): void {
    const { moves, humanColor } = game.state;
    const ply = moves.length - 1;
    // Only a human turn has a position search, so an engine's move finds none.
    const best = game.state.analysis && game.searches.best[ply];
    if (!best) return;
    if (moves[ply] === best.bestMove) {
      return this.judge(game, ply, bestVerdict(best.cp, best.second?.cp), { score: best.score });
    }
    // Nothing beats a mate, so another mate is best too, and shows no line.
    if (ended.termination === 'checkmate') return this.judge(game, ply, 'best', {});
    const playedCp = decidedCp(ended.result, humanColor);
    this.judge(game, ply, verdictOf(best.cp, playedCp), { best: bestLine(best, playedCp) });
  }

  /**
   * Records the verdict the move at `ply` is to show, if any, and its feedback. A move made on a
   * turn whose best move was hinted or shown earns no praise: at best it is the engine's own.
   */
  private judge(game: Game, ply: number, judged: Verdict | undefined, feedback: Feedback): void {
    const earned = game.hints[ply] || game.revealed[ply] ? withoutPraise(judged) : judged;
    const verdict = withoutOpeningPraise(earned, game.state.startFen, ply);
    if (feedback.best) game.revealed[ply] = true;
    const { verdicts, feedback: all } = game.state;
    game.state = {
      ...game.state,
      ...(verdict && { verdicts: verdicts!.with(ply, verdict) }),
      feedback: all!.with(ply, feedback),
    };
  }

  private async engineMove(game: Game): Promise<void> {
    if (!game.engine && !(await this.restartForTurn(game))) return;
    if (game.state.analysis && !(await this.judgeLastMove(game, game.searches))) return;
    const { state } = game;
    if ('level' in state) return this.levelMove(game, levelOf(state.level));
    const fen = state.fen;
    const feed = new Throttle<SearchInfo>(
      (info) => this.report(game, fen, info),
      REPORT_INTERVAL_MS,
    );
    let bestMove: string;
    try {
      // The whole game rather than the position alone, so the engine can see repetitions.
      ({ bestMove } = await game.engine!.search(
        { fen: state.startFen, moves: state.moves, limit: state.limit },
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
    this.playEngineMove(game, bestMove);
  }

  /**
   * Ranks every legal move with a search each, then plays the level's choice. No search lines are
   * reported: each child's score is from the other side, so the eval bar would flip between them.
   */
  private async levelMove(game: Game, level: Level): Promise<void> {
    const engine = game.engine!;
    const { startFen, moves } = game.state;
    const turnIsGone = () => this.turnIsGone(game, moves);
    // The levels are calibrated on depth-1 scores, which a deeper search left in the hash changes.
    if (game.searches.inHash && !(await this.clearHash(game, game.searches))) return;
    if (turnIsGone()) return;
    const search = async (uci: string) => {
      const { info } = await engine.search({
        fen: startFen,
        moves: [...moves, uci],
        limit: RANKING_LIMIT,
      });
      if (!info?.score) throw new EngineError(`no score for ${uci}`, engine.transcript());
      return info.score;
    };
    let ranked;
    game.rankingTurn = moves;
    try {
      ranked = await rankMoves([...game.positions], search, turnIsGone);
    } catch (error) {
      if (!(error instanceof SearchCancelledError)) this.fail(game, error);
      return;
    } finally {
      if (game.rankingTurn === moves) game.rankingTurn = undefined;
    }
    if (!ranked || turnIsGone()) return;
    game.surrenderedTurns = surrenders(ranked, level) ? game.surrenderedTurns + 1 : 0;
    if (resigns(game.surrenderedTurns, level)) {
      return this.finish(game, { result: game.state.humanColor, termination: 'resignation' });
    }
    const uci = chooseMove(ranked, level, this.options.rng ?? Math.random);
    if (!turnIsGone()) this.playEngineMove(game, uci);
  }

  /** False if the engine failed, which ends the game. */
  private async clearHash(game: Game, analysis: Analysis): Promise<boolean> {
    try {
      await game.engine!.clearHash();
    } catch (error) {
      this.fail(game, error);
      return false;
    }
    analysis.inHash = false;
    return true;
  }

  private playEngineMove(game: Game, uci: string): void {
    // The engine is not trusted: its move goes through the same rules as the human's.
    const result = applyUciMove(game.state.fen, uci);
    if (!result.ok) {
      return this.finish(game, {
        reason: `${game.state.engineName} played an illegal move: ${uci}`,
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
    // A throttled line can outlive its search, cancelled by a takeback or a resignation.
    if (this.game !== game || game.state.phase === 'over' || game.state.fen !== fen) return;
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
