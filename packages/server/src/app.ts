import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import {
  CLOSE_CODES,
  MAX_MESSAGE_BYTES,
  parseClientMessage,
  type ServerMessage,
} from '@stratchess-ui/shared';
import type { EngineProfile } from './engines/profiles.ts';
import { Controller, type Connection } from './game/controller.ts';
import { memoryStore, Pairings } from './pairing.ts';
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
  /** Defaults to an in-memory store that prints its codes to stdout. */
  pairings?: Pairings;
  /** How long a game waits for its browser to reconnect. */
  graceMs?: number;
};

const DEFAULT_GRACE_MS = 60_000;

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

/** Browsers send `Origin: null` from sandboxed or privacy-sensitive contexts; that is no host. */
function originHost(origin: string): string {
  return URL.canParse(origin) ? stripPort(new URL(origin).host) : '';
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const allowedHosts = new Set([...defaultHosts(), ...(options.extraHosts ?? [])]);
  const app = Fastify({ logger: false, bodyLimit: MAX_MESSAGE_BYTES });

  app.addHook('onRequest', async (request, reply) => {
    if (!allowedHosts.has(stripPort(request.headers.host ?? ''))) {
      return reply.code(421).send('unknown host');
    }
    // A request from another site's page, a WebSocket upgrade included, carries that site's Origin.
    const origin = request.headers.origin;
    if (origin && !allowedHosts.has(originHost(origin))) {
      return reply.code(403).send('origin not allowed');
    }
  });

  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_MESSAGE_BYTES } });

  app.get('/api/health', async () => ({ ok: true }));

  const log = options.log ?? ((text) => console.error(text));
  const pairings =
    options.pairings ?? new Pairings({ store: memoryStore(), announce: (t) => console.log(t) });
  const controller = new Controller({
    profiles: options.profiles ?? [],
    graceMs: options.graceMs ?? DEFAULT_GRACE_MS,
    timeouts: options.engineTimeouts,
    log,
  });
  app.addHook('onClose', () => controller.release());

  app.post<{ Body: { code?: unknown } }>('/api/pair', async (request, reply) => {
    const code = request.body?.code;
    const token =
      typeof code === 'string'
        ? pairings.pair(code, request.headers['user-agent'] ?? '')
        : undefined;
    if (!token) return reply.code(403).send({ reason: 'wrong pairing code' });
    return { token };
  });

  app.get<{ Querystring: { token?: string } }>('/ws', { websocket: true }, (socket, request) => {
    // Refused after the upgrade: a browser cannot tell a refused upgrade from a network drop.
    const token = request.query.token;
    if (!token || !pairings.isPaired(token))
      return socket.close(CLOSE_CODES.notPaired, 'not paired');
    const connection: Connection = {
      send: (msg: ServerMessage) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      },
      close: (code, reason) => socket.close(code, reason),
    };
    socket.on('message', (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) return connection.send({ type: 'error', reason: 'malformed message' });
      controller.receive(connection, msg);
    });
    socket.on('close', () => controller.detach(connection));
    controller.attach(token, connection);
  });

  if (options.staticRoot && existsSync(options.staticRoot)) {
    await app.register(fastifyStatic, { root: options.staticRoot });
  }

  return app;
}
