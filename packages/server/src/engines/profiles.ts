// Engine profiles live on the host. Browsers pick a profile id; they never send paths or commands.
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { LIMIT_RANGES } from '@stratchess-ui/shared';

export type OptionValue = string | number | boolean;

export type EngineProfile = {
  id: string;
  name: string;
  executable: string;
  args: string[];
  /** Working directory; StratChess resolves its config and logs from it. */
  cwd?: string;
  options: Record<string, OptionValue>;
  /** Plays the beginner opponent's levels, whose table is calibrated for StratChess only. */
  levels: boolean;
};

/** Host-wide caps, applied whatever a profile asks for. */
export const LIMITS = {
  maxThreads: 8,
  maxHashMiB: 1024,
  maxDepth: LIMIT_RANGES.depth.max,
  maxMovetimeMs: LIMIT_RANGES.movetimeMs.max,
};

export class ProfileError extends Error {}

export function parseProfiles(json: unknown, baseDir: string): EngineProfile[] {
  if (
    typeof json !== 'object' ||
    json === null ||
    !Array.isArray((json as { engines?: unknown }).engines)
  ) {
    throw new ProfileError('expected { "engines": [ ... ] }');
  }
  const seen = new Set<string>();
  return (json as { engines: unknown[] }).engines.map((raw, index) => {
    const profile = parseProfile(raw, `engines[${index}]`, baseDir);
    if (seen.has(profile.id)) throw new ProfileError(`duplicate engine id: ${profile.id}`);
    seen.add(profile.id);
    return profile;
  });
}

function parseProfile(raw: unknown, where: string, baseDir: string): EngineProfile {
  if (typeof raw !== 'object' || raw === null)
    throw new ProfileError(`${where}: expected an object`);
  const p = raw as Record<string, unknown>;
  const text = (key: string, required: boolean): string | undefined => {
    const value = p[key];
    if (value === undefined && !required) return undefined;
    if (typeof value !== 'string' || value === '')
      throw new ProfileError(`${where}.${key}: expected a string`);
    return value;
  };
  const id = text('id', true)!;
  if (!/^[a-z0-9-]+$/.test(id))
    throw new ProfileError(`${where}.id: use lowercase letters, digits and '-'`);
  const args = p.args ?? [];
  if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) {
    throw new ProfileError(`${where}.args: expected an array of strings`);
  }
  const options = p.options ?? {};
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new ProfileError(`${where}.options: expected an object`);
  }
  for (const [name, value] of Object.entries(options)) {
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new ProfileError(`${where}.options.${name}: expected a string, number or boolean`);
    }
  }
  if (p.levels !== undefined && typeof p.levels !== 'boolean')
    throw new ProfileError(`${where}.levels: expected true or false`);
  const absolute = (path: string | undefined) =>
    path === undefined || isAbsolute(path) ? path : resolve(baseDir, path);
  return {
    id,
    name: text('name', false) ?? id,
    executable: absolute(text('executable', true))!,
    args: args as string[],
    cwd: absolute(text('cwd', false)),
    options: capOptions(options as Record<string, OptionValue>, `${where}.options`),
    levels: p.levels === true,
  };
}

/** Clamps the options every engine shares to the host caps. */
function capOptions(
  options: Record<string, OptionValue>,
  where: string,
): Record<string, OptionValue> {
  const capped = { ...options };
  const seen = new Map<string, string>();
  for (const [name, value] of Object.entries(options)) {
    const resource = name.toLowerCase();
    const max =
      resource === 'threads'
        ? LIMITS.maxThreads
        : resource === 'hash'
          ? LIMITS.maxHashMiB
          : undefined;
    if (max === undefined) continue;
    const previous = seen.get(resource);
    if (previous !== undefined) {
      throw new ProfileError(`${where}.${name}: duplicates resource option ${previous}`);
    }
    seen.set(resource, name);
    const numeric = Number(value);
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && (value.trim() === '' || /[\r\n\0]/.test(value))) ||
      !Number.isInteger(numeric) ||
      numeric < 1
    ) {
      throw new ProfileError(`${where}.${name}: expected a positive integer number or string`);
    }
    // Engines must receive the same integer we validated, even for exponent or hex strings.
    capped[name] = Math.min(numeric, max);
  }
  return capped;
}

/** Reads the host's profile file; relative paths in it resolve against the file's directory. */
export function loadProfiles(path: string): EngineProfile[] {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new ProfileError(`cannot read ${path}: ${(error as Error).message}`);
  }
  return parseProfiles(json, dirname(path));
}
