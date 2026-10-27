import { describe, expect, it } from 'vitest';
import { limitLabel, materialLead, sortCaptures, stripChip } from './strip.ts';

describe('stripChip', () => {
  // Phase, result, then the engine's chip and the human's; * marks the raised one.
  it.each([
    ['starting', undefined, '*starting', 'waiting'],
    ['human', undefined, 'waiting', '*your move'],
    ['thinking', undefined, '*thinking', 'waiting'],
    ['over', 'black', 'lost', 'won'],
    ['over', 'white', 'won', 'lost'],
    ['over', 'draw', 'draw', 'draw'],
    ['over', undefined, 'ended', 'ended'],
  ] as const)('%s, result %s: engine %s, you %s', (phase, result, engine, human) => {
    const game = { phase, result, humanColor: 'black' as const };
    const shown = (side: 'engine' | 'human') => {
      const chip = stripChip(game, side);
      return `${chip.raised ? '*' : ''}${chip.text}`;
    };
    expect(shown('engine')).toBe(engine);
    expect(shown('human')).toBe(human);
  });
});

it('labels the limit by depth or move time, never a rating', () => {
  expect(limitLabel({ depth: 8 })).toBe('depth 8');
  expect(limitLabel({ movetimeMs: 1000 })).toBe('1000 ms');
});

it('orders captures cheapest first', () => {
  expect(sortCaptures(['queen', 'pawn', 'rook', 'knight', 'pawn', 'bishop'])).toEqual([
    'pawn',
    'pawn',
    'knight',
    'bishop',
    'rook',
    'queen',
  ]);
});

it('shows the lead on the side ahead only', () => {
  expect(materialLead(7, 'white')).toBe(7);
  expect(materialLead(7, 'black')).toBeUndefined();
  expect(materialLead(-3, 'black')).toBe(3);
  expect(materialLead(-3, 'white')).toBeUndefined();
  expect(materialLead(0, 'white')).toBeUndefined();
  expect(materialLead(0, 'black')).toBeUndefined();
});
