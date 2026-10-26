// The engine's search lines as the browser sees them: from white's perspective, PV in SAN, and no
// more often than a phone needs.
import { sanMoves, turn, type SearchReport } from '@stratchess-ui/shared';
import type { SearchInfo } from '../uci/protocol.ts';

const MAX_PV_PLIES = 32;

const FLIPPED_BOUND = { lower: 'upper', upper: 'lower' } as const;

/** Converts a line from a search of `fen`; the PV is engine output, so it is checked move by move. */
export function searchReport(fen: string, info: SearchInfo): SearchReport {
  const report: SearchReport = {};
  for (const key of ['depth', 'seldepth', 'nodes', 'nps'] as const) {
    const value = info[key];
    if (Number.isFinite(value)) report[key] = value;
  }
  // UCI scores are from the side to move; a lower bound for black is an upper bound for white.
  const flip = turn(fen) === 'black';
  const score = info.score;
  if (score && Number.isFinite('cp' in score ? score.cp : score.mate)) {
    report.score = !flip ? score : 'cp' in score ? { cp: -score.cp } : { mate: -score.mate };
  }
  if (info.bound) report.bound = flip ? FLIPPED_BOUND[info.bound] : info.bound;
  if (info.pv) report.pv = sanMoves(fen, info.pv.slice(0, MAX_PV_PLIES));
  return report;
}

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
