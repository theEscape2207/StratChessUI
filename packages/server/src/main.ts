import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';
import { loadProfiles, ProfileError, type EngineProfile } from './engines/profiles.ts';
import { fileStore, memoryStore, Pairings } from './pairing.ts';
import { fakeProfile } from './uci/fake-profile.ts';

const port = Number(process.env.PORT ?? 8080);
const staticRoot = fileURLToPath(new URL('../../client/dist', import.meta.url));
const extraHosts = process.env.EXTRA_HOSTS?.split(',').filter(Boolean);
const enginesFile = fileURLToPath(new URL('../../../engines.json', import.meta.url));
const pairingsFile = fileURLToPath(new URL('../../../pairings.json', import.meta.url));

/** `FAKE_ENGINE=<mode>` serves only the test engine, for Playwright. */
function profiles(): EngineProfile[] {
  if (process.env.FAKE_ENGINE) return [fakeProfile(process.env.FAKE_ENGINE)];
  if (!existsSync(enginesFile)) {
    console.warn(`no ${enginesFile}; copy engines.example.json to play against an engine`);
    return [];
  }
  try {
    return loadProfiles(enginesFile);
  } catch (error) {
    if (!(error instanceof ProfileError)) throw error;
    console.error(`engines.json: ${error.message}`);
    process.exit(1);
  }
}

/** Under the fake engine, Playwright pairs with `PAIRING_CODE` and nothing is written to disk. */
function pairings(): Pairings {
  const announce = (text: string) => console.log(text);
  if (!process.env.FAKE_ENGINE) return new Pairings({ store: fileStore(pairingsFile), announce });
  return new Pairings({ store: memoryStore(), announce, fixedCode: process.env.PAIRING_CODE });
}

const app = await buildApp({
  port,
  staticRoot,
  extraHosts,
  profiles: profiles(),
  pairings: pairings(),
});
await app.listen({ host: '0.0.0.0', port });
console.log(`StratChessUI listening on port ${port}`);
