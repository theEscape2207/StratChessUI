import { fileURLToPath } from 'node:url';
import type { EngineProfile } from '../engines/profiles.ts';

const FAKE = fileURLToPath(new URL('./fake-engine.ts', import.meta.url));

/**
 * A profile that runs the fake engine under this Node; see fake-engine.ts for the modes and the
 * other arguments it takes.
 */
export function fakeProfile(
  mode = 'normal',
  options: EngineProfile['options'] = {},
  args: string[] = [],
): EngineProfile {
  return {
    id: 'fake',
    name: 'StratChess (fake)',
    executable: process.execPath,
    args: [FAKE, `--mode=${mode}`, ...args],
    options,
    levels: false,
  };
}
