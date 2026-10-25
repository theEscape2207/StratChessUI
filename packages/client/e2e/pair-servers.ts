import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { BOARD_SERVERS, PAIRING_CODE, pairedState, serverURL } from './servers.ts';

// Pairs each board server once per run rather than once per worker: a worker restarted after a
// failure would mint a new token, which the server refuses while the old one's game waits out its
// grace period.
export default async function pairServers() {
  for (let index = 0; index < BOARD_SERVERS; index++) {
    const origin = serverURL(index);
    const response = await fetch(`${origin}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: PAIRING_CODE }),
    });
    if (!response.ok) throw new Error(`pairing ${origin}: ${response.status}`);
    const { token } = (await response.json()) as { token: string };
    const localStorage = [{ name: 'pairing-token', value: token }];
    await mkdir(dirname(pairedState(index)), { recursive: true });
    await writeFile(
      pairedState(index),
      JSON.stringify({ cookies: [], origins: [{ origin, localStorage }] }),
    );
  }
}
