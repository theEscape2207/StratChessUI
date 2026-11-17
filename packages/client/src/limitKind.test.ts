import { describe, expect, it } from 'vitest';
import { limitKind } from './NewGameForm.tsx';

describe('limitKind', () => {
  it('follows the engine until a kind is chosen: level if it has levels, else move time', () => {
    expect(limitKind(undefined, true)).toBe('level');
    expect(limitKind(undefined, false)).toBe('movetimeMs');
  });

  it('keeps a chosen limit on either engine', () => {
    expect(limitKind('depth', true)).toBe('depth');
    expect(limitKind('depth', false)).toBe('depth');
  });

  it('drops a chosen level on an engine without levels', () => {
    expect(limitKind('level', false)).toBe('movetimeMs');
    expect(limitKind('level', true)).toBe('level');
  });
});
