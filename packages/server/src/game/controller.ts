// The one game on this server and the paired browser that controls it. The game outlives the
// browser's socket for a grace period, so a phone that locks or a page that reloads resumes it.
import { CLOSE_CODES, type ClientMessage, type ServerMessage } from '@stratchess-ui/shared';
import type { EngineProfile } from '../engines/profiles.ts';
import type { Timeouts } from '../uci/engine.ts';
import { GameSession } from './session.ts';

export type Connection = {
  /** The browser's remote address, for the log. */
  address: string;
  send(msg: ServerMessage): void;
  close(code: number, reason: string): void;
};

export type ControllerOptions = {
  profiles: readonly EngineProfile[];
  graceMs: number;
  timeouts?: Partial<Timeouts>;
  log: (text: string) => void;
};

export class Controller {
  private readonly options: ControllerOptions;
  /** The controlling browser's pairing token, held until its grace period runs out. */
  private token?: string;
  private connection?: Connection;
  private session?: GameSession;
  private graceTimer?: ReturnType<typeof setTimeout>;

  constructor(options: ControllerOptions) {
    this.options = options;
  }

  /** Gives the game to the controlling browser's new connection, or refuses any other browser. */
  attach(token: string, connection: Connection): void {
    if (this.token !== undefined && this.token !== token) {
      this.options.log(`${connection.address} refused: another device controls the game`);
      return connection.close(CLOSE_CODES.busy, 'another device controls the game');
    }
    clearTimeout(this.graceTimer);
    if (this.connection) {
      this.options.log(`${this.connection.address} replaced by ${connection.address}`);
      this.connection.close(CLOSE_CODES.replaced, 'opened elsewhere');
    }
    this.options.log(`${connection.address} ${this.attachOutcome()}`);
    this.token = token;
    this.connection = connection;
    this.session ??= new GameSession({
      profiles: this.options.profiles,
      send: (msg) => this.connection?.send(msg),
      timeouts: this.options.timeouts,
      log: this.options.log,
    });
    const engines = this.options.profiles.map(({ id, name }) => ({ id, name }));
    connection.send({ type: 'hello', engines });
    const game = this.session.state;
    if (game) connection.send({ type: 'game', game });
    const search = this.session.search;
    if (search) connection.send({ type: 'search', ...search });
    const transcript = this.session.takeTranscript();
    if (transcript) connection.send({ type: 'transcript', lines: transcript, reset: true });
  }

  /** Messages from a connection that has been replaced are dropped. */
  receive(connection: Connection, msg: ClientMessage): void {
    if (connection !== this.connection || !this.session) return;
    if (msg.type === 'new-game') return void this.session.newGame(msg);
    this.session.move(msg.uci);
  }

  detach(connection: Connection): void {
    if (connection !== this.connection) return;
    this.connection = undefined;
    const { address } = connection;
    this.options.log(
      `${address} socket closed, grace period of ${this.options.graceMs} ms started`,
    );
    this.graceTimer = setTimeout(() => void this.expire(address), this.options.graceMs);
  }

  /** Ends the game, stopping its engine, and frees the server for any paired browser. */
  async release(): Promise<void> {
    clearTimeout(this.graceTimer);
    const session = this.session;
    this.session = undefined;
    this.token = undefined;
    await session?.close();
  }

  private attachOutcome(): string {
    if (!this.session) return 'connected, took control';
    return this.session.state ? 'reconnected, resumed the game' : 'reconnected, no game started';
  }

  /** Logged here and not in `release`, which also runs when the server shuts down. */
  private async expire(address: string): Promise<void> {
    const outcome = this.session?.state ? 'game ended' : 'no game to end';
    this.options.log(`${address} grace period ran out, ${outcome}`);
    await this.release();
  }
}
