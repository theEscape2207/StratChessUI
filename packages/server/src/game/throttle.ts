/** Passes on the first value at once, then at most one per interval, the newest winning. */
export class Throttle<T> {
  private readonly send: (value: T) => void;
  private readonly intervalMs: number;
  private pending?: T;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(send: (value: T) => void, intervalMs: number) {
    this.send = send;
    this.intervalMs = intervalMs;
  }

  push(value: T): void {
    if (this.timer) {
      this.pending = value;
      return;
    }
    this.send(value);
    this.timer = setTimeout(() => this.tick(), this.intervalMs);
  }

  /** Sends the pending value now and stops. */
  flush(): void {
    const pending = this.pending;
    this.cancel();
    if (pending !== undefined) this.send(pending);
  }

  /** Drops the pending value and stops. */
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
  }

  private tick(): void {
    this.timer = undefined;
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) this.push(pending);
  }
}
