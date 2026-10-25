// Messages over the game WebSocket. The server owns the game; the client only proposes moves.

export type ClientMessage = { type: 'move'; uci: string } | { type: 'new-game' };

export type ServerMessage =
  | { type: 'position'; fen: string; lastMove?: string; outcome?: string }
  | { type: 'error'; reason: string };

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
  if (msg.type === 'new-game') return { type: 'new-game' };
  if (msg.type === 'move' && typeof msg.uci === 'string') return { type: 'move', uci: msg.uci };
  return undefined;
}
