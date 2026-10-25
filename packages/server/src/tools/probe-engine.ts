// Manual check against a real engine: handshake, then one search from the start position.
// Usage: npm run probe-engine -- [profile-id] [engines.json]
import { START_FEN } from '@stratchess-ui/shared';
import { loadProfiles } from '../engines/profiles.ts';
import { EngineError, UciEngine } from '../uci/engine.ts';

const [id, file = 'engines.json'] = process.argv.slice(2);
const profiles = loadProfiles(file);
const profile = id ? profiles.find((p) => p.id === id) : profiles[0];
if (!profile) {
  console.error(`no profile '${id}' in ${file}; have: ${profiles.map((p) => p.id).join(', ')}`);
  process.exit(1);
}

let engine: UciEngine | undefined;
try {
  engine = await UciEngine.start(profile);
  console.log(`${engine.name} by ${engine.author}: ${engine.options.length} options`);
  const result = await engine.search(
    { fen: START_FEN, moves: ['e2e4'], limit: { depth: 8 } },
    (info) =>
      console.log(
        `  depth ${info.depth} score ${JSON.stringify(info.score)} pv ${info.pv?.join(' ')}`,
      ),
  );
  console.log(`bestmove ${result.bestMove}`);
  await engine.quit();
} catch (error) {
  console.error((error as Error).message);
  if (error instanceof EngineError) console.error(error.transcript.slice(-20).join('\n'));
  engine?.kill();
  process.exit(1);
}
