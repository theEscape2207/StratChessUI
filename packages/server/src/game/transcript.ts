import { MAX_TRANSCRIPT_LINE, TRANSCRIPT_LINES, type TranscriptLine } from '@stratchess-ui/shared';

/**
 * A game's transcript, passing new lines on in batches, at most one per interval. Unlike the
 * search feed, no line is dropped while it fits in the bound.
 */
export class TranscriptFeed {
  private readonly all: TranscriptLine[] = [];
  private pending: TranscriptLine[] = [];
  private readonly send: (lines: TranscriptLine[]) => void;
  private readonly intervalMs: number;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(send: (lines: TranscriptLine[]) => void, intervalMs: number) {
    this.send = send;
    this.intervalMs = intervalMs;
  }

  push({ dir, text }: TranscriptLine): void {
    const line = {
      dir,
      text: text.length > MAX_TRANSCRIPT_LINE ? `${text.slice(0, MAX_TRANSCRIPT_LINE - 1)}…` : text,
    };
    for (const lines of [this.all, this.pending]) {
      lines.push(line);
      if (lines.length > TRANSCRIPT_LINES) lines.shift();
    }
    this.timer ??= setTimeout(() => this.flush(), this.intervalMs);
  }

  /** Sends the pending lines now. */
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const pending = this.pending;
    this.pending = [];
    if (pending.length) this.send(pending);
  }

  /** The whole transcript, for sending instead of the pending lines, which are dropped. */
  takeAll(): TranscriptLine[] {
    this.cancel();
    return [...this.all];
  }

  /** Drops the pending lines and stops. */
  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = [];
  }
}
