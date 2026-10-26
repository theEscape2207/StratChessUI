// Messages over the game WebSocket. The server owns the game; the client only proposes moves.

export type Color = 'white' | 'black';

export type SearchLimit = { depth: number } | { movetimeMs: number };

/** Bounds the new-game form offers and the server enforces. Limits are never shown as Elo. */
export const LIMIT_RANGES = {
  depth: { min: 1, max: 40 },
  movetimeMs: { min: 100, max: 60_000 },
};

export type NewGameRequest = { humanColor: Color; engineId: string; limit: SearchLimit };

export type ClientMessage = { type: 'move'; uci: string } | ({ type: 'new-game' } & NewGameRequest);

export type EngineChoice = { id: string; name: string };

export type GamePhase = 'starting' | 'human' | 'thinking' | 'over';

export type Termination =
  'checkmate' | 'stalemate' | 'insufficient material' | 'fifty-move rule' | 'threefold repetition';

export type Outcome = { result: Color | 'draw'; termination: Termination };

export type GameState = {
  fen: string;
  /** The game so far from the start position, in standard UCI. */
  moves: string[];
  lastMove?: string;
  humanColor: Color;
  engineName: string;
  phase: GamePhase;
  /** Set, with how it ended, when the game ended by rule. */
  result?: Color | 'draw';
  termination?: Termination;
  /** Set when the game ended for another reason, such as an engine failure. */
  reason?: string;
};

export type ServerMessage =
  | { type: 'hello'; engines: EngineChoice[] }
  | { type: 'game'; game: GameState }
  | { type: 'error'; reason: string };

/** Why the server closed the game WebSocket; none of them is worth reconnecting for. */
export const CLOSE_CODES = {
  /** The token is unknown or was revoked: pair again. */
  notPaired: 4401,
  /** Another browser controls the game. */
  busy: 4409,
  /** This browser opened the game in another tab or a reloaded page. */
  replaced: 4000,
};

export const MAX_MESSAGE_BYTES = 4096;

export function parseClientMessage(raw: string): ClientMessage | undefined {
  if (raw.length > MAX_MESSAGE_BYTES) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const msg = value as Record<string, unknown>;
  if (msg.type === 'move' && typeof msg.uci === 'string') return { type: 'move', uci: msg.uci };
  if (msg.type !== 'new-game') return undefined;
  const limit = parseLimit(msg.limit);
  if (msg.humanColor !== 'white' && msg.humanColor !== 'black') return undefined;
  if (typeof msg.engineId !== 'string' || !limit) return undefined;
  return { type: 'new-game', humanColor: msg.humanColor, engineId: msg.engineId, limit };
}

function parseLimit(value: unknown): SearchLimit | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const limit = value as Record<string, unknown>;
  const inRange = (n: unknown, range: { min: number; max: number }): n is number =>
    Number.isInteger(n) && (n as number) >= range.min && (n as number) <= range.max;
  if (inRange(limit.depth, LIMIT_RANGES.depth)) return { depth: limit.depth };
  if (inRange(limit.movetimeMs, LIMIT_RANGES.movetimeMs)) return { movetimeMs: limit.movetimeMs };
  return undefined;
}
