import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import { MAX_MESSAGE_BYTES, parseClientMessage, type ServerMessage } from '@stratchess-ui/shared';
import type { EngineProfile } from './engines/profiles.ts';
import { GameSession } from './game/session.ts';
import type { Timeouts } from './uci/engine.ts';

export type AppOptions = {
  port: number;
  /** Built client assets; omitted in tests. */
  staticRoot?: string;
  /** Extra Host names to accept beyond localhost, this machine's name and its IPv4 addresses. */
  extraHosts?: string[];
  /** Engines a browser may choose from. */
  profiles?: EngineProfile[];
  engineTimeouts?: Partial<Timeouts>;
  /** Where engine failures are reported; defaults to stderr. */
  log?: (text: string) => void;
};

/** Host names the server answers to. Anything else is a DNS-rebinding attempt or a typo. */
export function defaultHosts(): string[] {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a !== undefined && a.family === 'IPv4')
    .map((a) => a!.address);
  return ['localhost', '127.0.0.1', hostname().toLowerCase(), ...addresses];
}

function stripPort(host: string): string {
  return host.replace(/:\d+$/, '').toLowerCase();
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const allowedHosts = new Set([...defaultHosts(), ...(options.extraHosts ?? [])]);
  const app = Fastify({ logger: false, bodyLimit: MAX_MESSAGE_BYTES });

  app.addHook('onRequest', async (request, reply) => {
    if (!allowedHosts.has(stripPort(request.headers.host ?? ''))) {
      return reply.code(421).send('unknown host');
    }
    // A WebSocket upgrade from another site's page carries that site's Origin.
    const origin = request.headers.origin;
    if (request.headers.upgrade && origin && !allowedHosts.has(stripPort(new URL(origin).host))) {
      return reply.code(403).send('origin not allowed');
    }
  });

  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  app.get('/api/health', async () => ({ ok: true }));

  // One game per connection until pairing and the single-controller rule land (M1).
  const profiles = options.profiles ?? [];
  app.get('/ws', { websocket: true }, (socket) => {
    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const session = new GameSession({
      profiles,
      send,
      timeouts: options.engineTimeouts,
      log: options.log ?? ((text) => console.error(text)),
    });
    send({ type: 'hello', engines: profiles.map(({ id, name }) => ({ id, name })) });

    socket.on('message', (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) return send({ type: 'error', reason: 'malformed message' });
      if (msg.type === 'new-game') return void session.newGame(msg);
      session.move(msg.uci);
    });
    socket.on('close', () => void session.close());
  });

  if (options.staticRoot && existsSync(options.staticRoot)) {
    await app.register(fastifyStatic, { root: options.staticRoot });
  }

  return app;
}
