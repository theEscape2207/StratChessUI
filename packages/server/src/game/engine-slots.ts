// The bound on running engine processes across all browsers' games. A slot is held from before the
// process starts until it has exited, so an engine still quitting counts: its Threads and Hash stay
// in use until then.

export class EngineSlots {
  readonly limit: number;
  private used = 0;

  constructor(limit: number) {
    this.limit = limit;
  }

  /** Whether a slot was free; if so it is now taken, until `free`. */
  take(): boolean {
    if (this.used >= this.limit) return false;
    this.used++;
    return true;
  }

  free(): void {
    this.used--;
  }
}
