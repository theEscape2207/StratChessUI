import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hostDir } from './host-dir.ts';

describe('hostDir', () => {
  it('prefers STRATCHESS_UI_HOME on any platform', () => {
    expect(hostDir({ STRATCHESS_UI_HOME: 'X', APPDATA: 'A' }, 'win32')).toBe('X');
  });

  it('uses APPDATA on Windows and XDG_CONFIG_HOME elsewhere', () => {
    expect(hostDir({ APPDATA: 'A', XDG_CONFIG_HOME: 'C' }, 'win32')).toBe(
      join('A', 'StratChessUI'),
    );
    expect(hostDir({ APPDATA: 'A', XDG_CONFIG_HOME: 'C' }, 'linux')).toBe(
      join('C', 'stratchess-ui'),
    );
  });
});
