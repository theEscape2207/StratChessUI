// Pairing: the host shows a short code; a browser that enters it gets a token it keeps until the
// owner revokes it by deleting its entry from the pairings file.
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type Pairing = { token: string; pairedAt: string; userAgent: string };

/** Where pairings live. The file store re-reads on every lookup so a revocation applies at once. */
export interface PairingStore {
  load(): Pairing[];
  save(pairings: Pairing[]): void;
}

export function memoryStore(): PairingStore {
  let pairings: Pairing[] = [];
  return { load: () => pairings, save: (p) => void (pairings = p) };
}

export function fileStore(path: string): PairingStore {
  return {
    load: () => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Pairing[]) : []),
    save: (pairings) => writeFileSync(path, JSON.stringify(pairings, null, 2) + '\n'),
  };
}

const MAX_FAILURES = 5;

export type PairingOptions = {
  store: PairingStore;
  /** Where each new code and failed attempt is shown to the owner. */
  announce: (text: string) => void;
  /** A code that never rotates, for Playwright. */
  fixedCode?: string;
};

export class Pairings {
  private readonly options: PairingOptions;
  private code = '';
  private failures = 0;

  constructor(options: PairingOptions) {
    this.options = options;
    this.rotate();
  }

  /** Returns a new token for the right code; any other code counts towards rotating it. */
  pair(code: string, userAgent: string): string | undefined {
    if (code !== this.code) {
      this.failures++;
      this.options.announce(`pairing: wrong code (${this.failures} of ${MAX_FAILURES})`);
      if (this.failures >= MAX_FAILURES) this.rotate();
      return undefined;
    }
    const token = randomBytes(32).toString('base64url');
    const pairedAt = new Date().toISOString();
    this.options.store.save([...this.options.store.load(), { token, pairedAt, userAgent }]);
    this.rotate();
    return token;
  }

  isPaired(token: string): boolean {
    return this.options.store.load().some((p) => p.token === token);
  }

  private rotate(): void {
    this.failures = 0;
    if (this.code && this.options.fixedCode) return;
    this.code = this.options.fixedCode ?? String(randomInt(1_000_000)).padStart(6, '0');
    this.options.announce(`pairing code: ${this.code}`);
  }
}
