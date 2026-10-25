import { fileURLToPath } from 'node:url';
import type { EngineProfile } from '../engines/profiles.ts';

const FAKE = fileURLToPath(new URL('./fake-engine.ts', import.meta.url));

/** A profile that runs the fake engine (see fake-engine.ts for the modes) under this Node. */
export function fakeProfile(
  mode = 'normal',
  options: EngineProfile['options'] = {},
): EngineProfile {
  return {
    id: 'fake',
    name: 'StratChess (fake)',
    executable: process.execPath,
    args: [FAKE, `--mode=${mode}`],
    options,
  };
}
