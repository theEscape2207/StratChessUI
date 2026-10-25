// Controller for one UCI engine process: handshake, options, one search at a time.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { LIMITS, type EngineProfile } from '../engines/profiles.ts';
import {
  goCommand,
  isRejectedPosition,
  MAX_LINE_LENGTH,
  parseBestMove,
  parseInfo,
  parseOption,
  positionCommand,
  setOptionCommand,
  UciCommandError,
  type SearchInfo,
  type SearchLimit,
  type UciOption,
} from './protocol.ts';

export type Timeouts = {
  handshakeMs: number;
  readyMs: number;
  /** How long after `stop` the engine has to answer with `bestmove` before it is killed. */
  stopGraceMs: number;
  /** Hard cap on any search; a depth search still running then is stopped. */
  maxSearchMs: number;
};

export const DEFAULT_TIMEOUTS: Timeouts = {
  handshakeMs: 10_000,
  readyMs: 5_000,
  stopGraceMs: 2_000,
  maxSearchMs: LIMITS.maxMovetimeMs,
};

const TRANSCRIPT_LINES = 1000;

export class EngineError extends Error {
  readonly transcript: readonly string[];
  constructor(message: string, transcript: readonly string[]) {
    super(message);
    this.transcript = transcript;
  }
}

/** The engine refused the position (StratChess resets to the start position instead). */
export class PositionRejectedError extends EngineError {}

/** The search was stopped or replaced by a newer one; its `bestmove` was discarded. */
export class SearchCancelledError extends Error {}

export type SearchRequest = { fen: string; moves?: readonly string[]; limit: SearchLimit };

export type SearchResult = {
  generation: number;
  bestMove: string;
  /** Last info line with a score, if the engine sent one. */
  info?: SearchInfo;
};

type Waiter = {
  match: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
};

type ActiveSearch = { generation: number; cancelled: boolean; stopSent: boolean };

export class UciEngine {
  readonly profile: EngineProfile;
  name?: string;
  author?: string;
  readonly options: UciOption[] = [];

  private readonly child: ChildProcessWithoutNullStreams;
  private readonly timeouts: Timeouts;
  private readonly lines: string[] = [];
  private readonly waiters: Waiter[] = [];
  private lineListener?: (line: string) => void;
  private exitError?: EngineError;
  private readonly exited: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private active?: ActiveSearch;

  private constructor(profile: EngineProfile, timeouts: Timeouts) {
    this.profile = profile;
    this.timeouts = timeouts;
    // No shell: the executable and arguments are passed to the OS as they are.
    this.child = spawn(profile.executable, profile.args, {
      cwd: profile.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => this.onLine(line));
    createInterface({ input: this.child.stderr }).on('line', (line) => this.record(`! ${line}`));
    this.child.stdin.on('error', () => {}); // a dead engine surfaces through 'exit' instead
    this.exited = new Promise((resolve) => {
      this.child.on('error', (error) => {
        this.fail(`cannot start ${profile.executable}: ${error.message}`);
        resolve();
      });
      this.child.on('exit', (code, signal) => {
        this.fail(`engine exited (${signal ?? `code ${code}`})`);
        resolve();
      });
    });
  }

  /** Starts the engine, completes the UCI handshake and applies the profile's options. */
  static async start(profile: EngineProfile, timeouts: Partial<Timeouts> = {}): Promise<UciEngine> {
    const engine = new UciEngine(profile, { ...DEFAULT_TIMEOUTS, ...timeouts });
    try {
      await engine.handshake();
      return engine;
    } catch (error) {
      engine.kill();
      throw error;
    }
  }

  transcript(): readonly string[] {
    return [...this.lines];
  }

  get alive(): boolean {
    return this.exitError === undefined;
  }

  /**
   * Searches a position. A newer search, or `stop()`, cancels this one: its promise then rejects
   * with SearchCancelledError and its `bestmove` is discarded.
   */
  search(request: SearchRequest, onInfo?: (info: SearchInfo) => void): Promise<SearchResult> {
    const generation = ++this.generation;
    this.cancelActive();
    const run = this.queue.then(() => this.runSearch(generation, request, onInfo));
    this.queue = run.catch(() => {});
    return run;
  }

  /** Cancels the running search, if any, and resolves once the engine is idle again. */
  async stop(): Promise<void> {
    this.generation++;
    this.cancelActive();
    await this.queue;
  }

  /** Asks the engine to quit, then kills it if it has not exited in time. */
  async quit(): Promise<void> {
    if (!this.alive) return;
    await this.stop();
    this.send('quit');
    const timer = setTimeout(() => this.kill(), this.timeouts.stopGraceMs);
    await this.exited;
    clearTimeout(timer);
  }

  kill(): void {
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill();
  }

  private async handshake(): Promise<void> {
    this.lineListener = (line) => {
      if (line.startsWith('id name ')) this.name = line.slice(8);
      else if (line.startsWith('id author ')) this.author = line.slice(10);
      else {
        const option = parseOption(line);
        if (option) this.options.push(option);
      }
    };
    this.send('uci');
    await this.waitFor((l) => l === 'uciok', this.timeouts.handshakeMs, 'uciok');
    this.lineListener = undefined;

    for (const [name, value] of Object.entries(this.profile.options)) {
      this.checkOption(name, value);
      this.send(setOptionCommand(name, value));
    }
    await this.ready();
  }

  private checkOption(name: string, value: string | number | boolean): void {
    const option = this.options.find((o) => o.name.toLowerCase() === name.toLowerCase());
    if (!option) throw this.error(`engine does not announce option ${name}`);
    if (option.type === 'spin') {
      const n = Number(value);
      const inRange = Number.isInteger(n) && n >= (option.min ?? n) && n <= (option.max ?? n);
      if (!inRange)
        throw this.error(`option ${name}=${value} outside ${option.min}..${option.max}`);
    }
  }

  private async ready(): Promise<string[]> {
    const seen: string[] = [];
    this.lineListener = (line) => seen.push(line);
    try {
      this.send('isready');
      await this.waitFor((l) => l === 'readyok', this.timeouts.readyMs, 'readyok');
      return seen;
    } finally {
      this.lineListener = undefined;
    }
  }

  private async runSearch(
    generation: number,
    request: SearchRequest,
    onInfo?: (info: SearchInfo) => void,
  ): Promise<SearchResult> {
    if (generation !== this.generation) throw new SearchCancelledError('superseded');
    if (this.exitError) throw this.exitError;
    const command = positionCommand(request.fen, request.moves ?? []);
    const go = goCommand(this.checkLimit(request.limit));

    // StratChess only reports a bad FEN as an info string, so confirm the position before searching.
    this.send(command);
    const seen = await this.ready();
    if (seen.some(isRejectedPosition))
      throw new PositionRejectedError(
        `engine rejected the position: ${seen.find(isRejectedPosition)}`,
        this.transcript(),
      );
    if (generation !== this.generation) throw new SearchCancelledError('superseded');

    const search: ActiveSearch = { generation, cancelled: false, stopSent: false };
    this.active = search;
    let last: SearchInfo | undefined;
    this.lineListener = (line) => {
      const info = parseInfo(line);
      if (!info) return;
      if (info.score) last = info;
      if (!search.cancelled) onInfo?.(info);
    };

    // A movetime search stops itself; `stop` only follows if the engine overruns by the grace.
    const hardLimitMs =
      'movetimeMs' in request.limit
        ? request.limit.movetimeMs + this.timeouts.stopGraceMs
        : this.timeouts.maxSearchMs;
    const hardStop = setTimeout(() => this.sendStop(search), hardLimitMs);
    let line: string;
    try {
      this.send(go);
      line = await this.waitFor(
        (l) => l.startsWith('bestmove'),
        hardLimitMs + this.timeouts.stopGraceMs,
        'bestmove',
      );
    } catch (error) {
      this.kill(); // exited, or ignored `stop`: either way it cannot be trusted with another search
      throw error;
    } finally {
      clearTimeout(hardStop);
      this.lineListener = undefined;
      this.active = undefined;
    }
    if (search.cancelled) throw new SearchCancelledError('cancelled');
    const bestMove = parseBestMove(line);
    // `0000` is the answer for a mated or stalemated side: a caller error, not an engine fault.
    if (!bestMove || bestMove === '(none)' || bestMove === '0000') {
      throw this.error(`engine returned no move: ${line}`);
    }
    return { generation, bestMove, info: last };
  }

  private checkLimit(limit: SearchLimit): SearchLimit {
    if ('depth' in limit && limit.depth > LIMITS.maxDepth) {
      throw new UciCommandError(`depth ${limit.depth} exceeds ${LIMITS.maxDepth}`);
    }
    if ('movetimeMs' in limit && limit.movetimeMs > this.timeouts.maxSearchMs) {
      throw new UciCommandError(
        `movetime ${limit.movetimeMs} exceeds ${this.timeouts.maxSearchMs} ms`,
      );
    }
    return limit;
  }

  private cancelActive(): void {
    if (!this.active) return;
    this.active.cancelled = true;
    this.sendStop(this.active);
  }

  private sendStop(search: ActiveSearch): void {
    if (search.stopSent) return;
    search.stopSent = true;
    this.send('stop');
  }

  private send(command: string): void {
    if (this.exitError) return;
    this.record(`> ${command}`);
    this.child.stdin.write(`${command}\n`);
  }

  private onLine(raw: string): void {
    const line = raw.length > MAX_LINE_LENGTH ? raw.slice(0, MAX_LINE_LENGTH) : raw.trimEnd();
    this.record(`< ${line}`);
    this.lineListener?.(line);
    const index = this.waiters.findIndex((w) => w.match(line));
    if (index >= 0) this.waiters.splice(index, 1)[0]!.resolve(line);
  }

  private waitFor(
    match: (line: string) => boolean,
    timeoutMs: number,
    what: string,
  ): Promise<string> {
    if (this.exitError) return Promise.reject(this.exitError);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(this.error(`timed out after ${timeoutMs} ms waiting for ${what}`));
      }, timeoutMs);
      const waiter: Waiter = {
        match,
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.waiters.push(waiter);
    });
  }

  private fail(message: string): void {
    if (this.exitError) return;
    this.exitError = this.error(message);
    for (const waiter of this.waiters.splice(0)) waiter.reject(this.exitError);
  }

  private error(message: string): EngineError {
    return new EngineError(message, this.transcript());
  }

  private record(line: string): void {
    this.lines.push(line);
    if (this.lines.length > TRANSCRIPT_LINES) this.lines.shift();
  }
}
