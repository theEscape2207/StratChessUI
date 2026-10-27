import { describe, expect, it } from 'vitest';
import { evalAriaLabel, evalFill, evalLabel, evalLeader } from './eval.ts';

describe('evalFill', () => {
  it('is half at 0.00 and before the first score', () => {
    expect(evalFill({ cp: 0 })).toBe(50);
    expect(evalFill(undefined)).toBe(50);
  });

  it('grows with white', () => {
    expect(evalFill({ cp: 400 })).toBe(72.5);
    expect(evalFill({ cp: -400 })).toBe(27.5);
  });

  it('clamps at eight pawns to 5% and 95%', () => {
    expect(evalFill({ cp: 800 })).toBe(95);
    expect(evalFill({ cp: 3000 })).toBe(95);
    expect(evalFill({ cp: -800 })).toBe(5);
    expect(evalFill({ cp: -3000 })).toBe(5);
  });

  it('fills all of the bar for the mating side', () => {
    expect(evalFill({ mate: 4 })).toBe(100);
    expect(evalFill({ mate: -4 })).toBe(0);
  });
});

describe('the number', () => {
  it('is unsigned pawns, at the leading side', () => {
    expect(evalLabel({ cp: 100 })).toBe('1.0');
    expect(evalLeader({ cp: 100 })).toBe('white');
    expect(evalLabel({ cp: -320 })).toBe('3.2');
    expect(evalLeader({ cp: -320 })).toBe('black');
    expect(evalLabel({ cp: 0 })).toBe('0.0');
    expect(evalLeader({ cp: 0 })).toBe('white');
  });

  it('is M and the moves to mate, at the mating side', () => {
    expect(evalLabel({ mate: 4 })).toBe('M4');
    expect(evalLeader({ mate: 4 })).toBe('white');
    expect(evalLabel({ mate: -4 })).toBe('M4');
    expect(evalLeader({ mate: -4 })).toBe('black');
  });

  it('is named for white to a screen reader, with its sign', () => {
    expect(evalAriaLabel({ cp: 100 })).toBe('Evaluation +1.0 for white');
    expect(evalAriaLabel({ cp: -60 })).toBe('Evaluation -0.6 for white');
    expect(evalAriaLabel({ mate: -4 })).toBe('Black mates in 4');
    expect(evalAriaLabel(undefined)).toBe('Evaluation not yet known');
  });
});
