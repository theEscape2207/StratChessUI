import { describe, expect, it } from 'vitest';
import { decidedCp, scoreCp } from './opponent.ts';
import { ANALYSIS, verdictOf, winChance } from './verdicts.ts';

/** The score that gives this win chance, in percent. */
const cpAt = (chance: number) => Math.log(chance / (100 - chance)) / ANALYSIS.steepness;

/** The verdict on a move that drops this many points from a win chance of 60. */
const dropping = (points: number) => verdictOf(cpAt(60), cpAt(60 - points));

describe('winChance', () => {
  it("follows Lichess's curve, even at 50 and the same for both sides", () => {
    expect(winChance(0)).toBe(50);
    expect(winChance(100)).toBeCloseTo(59.1, 1);
    expect(winChance(-100)).toBeCloseTo(100 - winChance(100), 10);
  });

  it('is 100 or 0 for a mate, however far off', () => {
    expect(winChance(scoreCp({ mate: 1 }))).toBe(100);
    expect(winChance(scoreCp({ mate: 40 }))).toBe(100);
    expect(winChance(scoreCp({ mate: -1 }))).toBeCloseTo(0, 10);
    expect(winChance(scoreCp({ mate: -40 }))).toBeCloseTo(0, 10);
  });
});

describe('verdictOf', () => {
  it('goes by the drop in win chance, with none between excellent and an inaccuracy', () => {
    expect(dropping(0)).toBe('excellent');
    expect(dropping(1.9)).toBe('excellent');
    expect(dropping(2.1)).toBeUndefined();
    expect(dropping(4.9)).toBeUndefined();
    expect(dropping(5.1)).toBe('inaccuracy');
    expect(dropping(9.9)).toBe('inaccuracy');
    expect(dropping(10.1)).toBe('mistake');
    expect(dropping(14.9)).toBe('mistake');
    expect(dropping(15.1)).toBe('blunder');
    expect(dropping(59)).toBe('blunder');
  });

  it('calls a move that scores better than the best excellent', () => {
    expect(verdictOf(0, 300)).toBe('excellent');
  });

  it('does not fault three pawns given up in a game long won, as raw pawns would', () => {
    expect(verdictOf(1500, 1200)).toBe('excellent');
    expect(verdictOf(150, -150)).toBe('blunder');
  });

  it('faults a mate let go, but not a slower mate', () => {
    expect(verdictOf(scoreCp({ mate: 2 }), scoreCp({ mate: 5 }))).toBe('excellent');
    expect(verdictOf(scoreCp({ mate: 2 }), 300)).toBe('blunder');
    expect(verdictOf(0, scoreCp({ mate: -3 }))).toBe('blunder');
    expect(verdictOf(scoreCp({ mate: -3 }), scoreCp({ mate: -1 }))).toBe('excellent');
  });

  it('scores a position the rules decide as a win at 100 and a draw at 50', () => {
    expect(verdictOf(scoreCp({ mate: 1 }), decidedCp('white', 'white'))).toBe('excellent');
    expect(verdictOf(900, decidedCp('draw', 'white'))).toBe('blunder');
    expect(verdictOf(-900, decidedCp('draw', 'black'))).toBe('excellent');
    expect(verdictOf(30, decidedCp('draw', 'black'))).toBeUndefined();
  });
});
