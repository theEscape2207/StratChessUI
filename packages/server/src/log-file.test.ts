import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const main = fileURLToPath(new URL('./main.ts', import.meta.url));
let dir: string;

afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function waitFor(read: () => string, text: string): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const content = read();
    if (content.includes(text)) return content;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no '${text}' in: ${read()}`);
}

test('LOG_FILE replaces the log at start and receives what the console would show', async () => {
  dir = mkdtempSync(join(tmpdir(), 'log-file-'));
  const file = join(dir, 'server.log');
  writeFileSync(file, 'previous run\n');
  const env = { ...process.env, FAKE_ENGINE: 'legal', PAIRING_CODE: '135790', PORT: '0' };
  const server = spawn(process.execPath, [main], { env: { ...env, LOG_FILE: file } });
  let stdout = '';
  server.stdout.on('data', (chunk) => (stdout += chunk));
  try {
    const log = await waitFor(() => readFileSync(file, 'utf8'), 'listening');
    expect(log).toContain('pairing code: 135790');
    expect(log).not.toContain('previous run');
    expect(stdout).toBe('');
  } finally {
    server.kill();
  }
});
