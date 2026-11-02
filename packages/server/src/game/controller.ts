// One game for each paired browser. A game outlives its browser's socket for a grace period, so a
// phone that locks or a page that reloads resumes it.
import { CLOSE_CODES, type ClientMessage, type ServerMessage } from '@stratchess-ui/shared';
import type { EngineProfile } from '../engines/profiles.ts';
import type { Timeouts } from '../uci/engine.ts';
import { EngineSlots } from './engine-slots.ts';
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
  /** How many engine processes may run at once, across all browsers. */
  engineLimit: number;
  timeouts?: Partial<Timeouts>;
  log: (text: string) => void;
};

/** A paired browser's game and current socket, held until its grace period runs out. */
type Browser = {
  token: string;
  connection?: Connection;
  session: GameSession;
  graceTimer?: ReturnType<typeof setTimeout>;
};

export class Controller {
  private readonly options: ControllerOptions;
  private readonly slots: EngineSlots;
  /** Keyed by pairing token, a credential: keep the keys and `Browser.token` out of the log. */
  private readonly browsers = new Map<string, Browser>();
  private readonly browserOf = new WeakMap<Connection, Browser>();

  constructor(options: ControllerOptions) {
    this.options = options;
    this.slots = new EngineSlots(options.engineLimit);
  }

  /** Gives the browser's game to its new connection, closing any older one. */
  attach(token: string, connection: Connection): void {
    const known = this.browsers.get(token);
    clearTimeout(known?.graceTimer);
    if (known?.connection) {
      this.options.log(`${known.connection.address} replaced by ${connection.address}`);
      known.connection.close(CLOSE_CODES.replaced, 'opened elsewhere');
    }
    this.options.log(`${connection.address} ${this.attachOutcome(known)}`);
    const browser = known ?? this.addBrowser(token);
    browser.connection = connection;
    this.browserOf.set(connection, browser);
    const engines = this.options.profiles.map(({ id, name }) => ({ id, name }));
    connection.send({ type: 'hello', engines });
    const game = browser.session.state;
    if (game) connection.send({ type: 'game', game });
    const search = browser.session.search;
    if (search) connection.send({ type: 'search', ...search });
    const transcript = browser.session.takeTranscript();
    if (transcript) connection.send({ type: 'transcript', lines: transcript, reset: true });
  }

  /** Messages from a connection that has been replaced are dropped. */
  receive(connection: Connection, msg: ClientMessage): void {
    const browser = this.browserOf.get(connection);
    if (browser?.connection !== connection) return;
    if (msg.type === 'new-game') return void browser.session.newGame(msg);
    browser.session.move(msg.uci);
  }

  detach(connection: Connection): void {
    const browser = this.browserOf.get(connection);
    if (browser?.connection !== connection) return;
    browser.connection = undefined;
    const { address } = connection;
    this.options.log(
      `${address} socket closed, grace period of ${this.options.graceMs} ms started`,
    );
    browser.graceTimer = setTimeout(() => void this.expire(browser, address), this.options.graceMs);
  }

  /** Ends every game, stopping its engine. */
  async release(): Promise<void> {
    const browsers = [...this.browsers.values()];
    this.browsers.clear();
    await Promise.all(
      browsers.map((browser) => {
        clearTimeout(browser.graceTimer);
        return browser.session.close();
      }),
    );
  }

  private addBrowser(token: string): Browser {
    const browser: Browser = {
      token,
      session: new GameSession({
        profiles: this.options.profiles,
        slots: this.slots,
        send: (msg) => browser.connection?.send(msg),
        refused: (reason) => this.options.log(`${browser.connection?.address} refused: ${reason}`),
        timeouts: this.options.timeouts,
        log: this.options.log,
      }),
    };
    this.browsers.set(token, browser);
    return browser;
  }

  private attachOutcome(browser?: Browser): string {
    if (!browser) return 'connected, took control';
    return browser.session.state ? 'reconnected, resumed the game' : 'reconnected, no game started';
  }

  /** Logged here and not in `release`, which runs when the server shuts down. */
  private async expire(browser: Browser, address: string): Promise<void> {
    const outcome = browser.session.state ? 'game ended' : 'no game to end';
    this.options.log(`${address} grace period ran out, ${outcome}`);
    this.browsers.delete(browser.token);
    await browser.session.close();
  }
}
