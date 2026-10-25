// Host state (engines.json, pairings.json) lives in one per-user directory, outside any checkout,
// so every worktree sees the same engines and the same paired browsers.
import { homedir } from 'node:os';
import { join } from 'node:path';

export function hostDir(env = process.env, platform = process.platform): string {
  if (env.STRATCHESS_UI_HOME) return env.STRATCHESS_UI_HOME;
  if (platform === 'win32' && env.APPDATA) return join(env.APPDATA, 'StratChessUI');
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'stratchess-ui');
}
