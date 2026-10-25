import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { networkInterfaces, hostname } from 'node:os';
import {
  applyUciMove,
  MAX_MESSAGE_BYTES,
  outcome,
  parseClientMessage,
  START_FEN,
  type ServerMessage,
} from '@stratchess-ui/shared';

export type AppOptions = {
  port: number;
  /** Built client assets; omitted in tests. */
  staticRoot?: string;
  /** Extra Host names to accept beyond localhost, this machine's name and its IPv4 addresses. */
  extraHosts?: string[];
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
  app.get('/ws', { websocket: true }, (socket) => {
    let fen = START_FEN;
    const send = (msg: ServerMessage) => socket.send(JSON.stringify(msg));
    send({ type: 'position', fen });

    socket.on('message', (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) return send({ type: 'error', reason: 'malformed message' });
      if (msg.type === 'new-game') {
        fen = START_FEN;
        return send({ type: 'position', fen });
      }
      const result = applyUciMove(fen, msg.uci);
      if (!result.ok) return send({ type: 'error', reason: result.reason });
      fen = result.fen;
      send({ type: 'position', fen, lastMove: msg.uci, outcome: outcome(fen) });
    });
  });

  if (options.staticRoot && existsSync(options.staticRoot)) {
    await app.register(fastifyStatic, { root: options.staticRoot });
  }

  return app;
}
