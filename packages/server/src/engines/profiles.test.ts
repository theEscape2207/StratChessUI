import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIMITS, parseProfiles } from './profiles.ts';

const BASE = resolve('/host/config');

describe('engine profiles', () => {
  it('resolves relative paths against the config file and caps Threads and Hash', () => {
    const [profile] = parseProfiles(
      {
        engines: [
          {
            id: 'stratchess',
            executable: 'engines/StratChessEvolved.exe',
            cwd: 'engines',
            options: { Threads: 64, Hash: 4096, Contempt: 10 },
          },
        ],
      },
      BASE,
    );
    expect(profile).toEqual({
      id: 'stratchess',
      name: 'stratchess',
      executable: resolve(BASE, 'engines/StratChessEvolved.exe'),
      args: [],
      cwd: resolve(BASE, 'engines'),
      options: { Threads: LIMITS.maxThreads, Hash: LIMITS.maxHashMiB, Contempt: 10 },
    });
  });

  it('rejects malformed profiles with the field at fault', () => {
    expect(() => parseProfiles({}, BASE)).toThrow('expected { "engines"');
    expect(() => parseProfiles({ engines: [{ id: 'x' }] }, BASE)).toThrow('engines[0].executable');
    expect(() => parseProfiles({ engines: [{ id: 'Bad Id', executable: 'e' }] }, BASE)).toThrow(
      'engines[0].id',
    );
    expect(() =>
      parseProfiles({ engines: [{ id: 'x', executable: 'e', args: 'a' }] }, BASE),
    ).toThrow('args');
    expect(() =>
      parseProfiles({ engines: [{ id: 'x', executable: 'e', options: { Hash: [1] } }] }, BASE),
    ).toThrow('options.Hash');
    expect(() =>
      parseProfiles(
        {
          engines: [
            { id: 'x', executable: 'e' },
            { id: 'x', executable: 'f' },
          ],
        },
        BASE,
      ),
    ).toThrow('duplicate engine id: x');
  });
});
