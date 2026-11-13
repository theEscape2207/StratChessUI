// A server started by a scheduled task has no console: `LOG_FILE` sends what it would print there
// to a file, replaced at each start.
import { Console } from 'node:console';
import { openSync, writeSync } from 'node:fs';
import { Writable } from 'node:stream';

export function logToFile(file: string): void {
  const fd = openSync(file, 'w');
  // Synchronous, so the line printed before a process.exit reaches the file.
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      writeSync(fd, chunk);
      done();
    },
  });
  globalThis.console = new Console({ stdout: stream, stderr: stream });
  // Node prints an uncaught exception to the real stderr, bypassing console.
  process.on('uncaughtExceptionMonitor', (error) => writeSync(fd, `${error.stack ?? error}\n`));
}
