import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { CLOSE_CODES, type ClientMessage, type ServerMessage } from '@stratchess-ui/shared';

export type Link = 'connecting' | 'connected' | 'reconnecting' | 'busy' | 'replaced';

const RETRY_MS = 2000;

/**
 * The game WebSocket for a paired browser. A dropped socket is retried, so a phone that locks gets
 * its game back within the server's grace period; a socket the server closed on purpose is not.
 */
export function useGameSocket(
  token: string,
  onMessage: (msg: ServerMessage) => void,
  onUnpaired: () => void,
) {
  const socket = useRef<WebSocket | undefined>(undefined);
  const [link, setLink] = useState<Link>('connecting');
  const [attempt, setAttempt] = useState(0);
  const received = useEffectEvent(onMessage);
  const unpaired = useEffectEvent(onUnpaired);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws?token=${encodeURIComponent(token)}`);
    socket.current = ws;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const reconnect = () => {
      clearTimeout(retryTimer);
      setLink('connecting');
      setAttempt((a) => a + 1);
    };
    const onVisible = () => {
      if (!document.hidden && retryTimer !== undefined) reconnect();
    };
    ws.onopen = () => setLink('connected');
    ws.onmessage = (event: MessageEvent<string>) =>
      received(JSON.parse(event.data) as ServerMessage);
    ws.onclose = (event) => {
      if (event.code === CLOSE_CODES.notPaired) return unpaired();
      if (event.code === CLOSE_CODES.busy) return setLink('busy');
      if (event.code === CLOSE_CODES.replaced) return setLink('replaced');
      setLink('reconnecting');
      retryTimer = setTimeout(reconnect, RETRY_MS);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisible);
      ws.onclose = null;
      ws.close();
    };
  }, [token, attempt]);

  const send = (msg: ClientMessage) => socket.current?.send(JSON.stringify(msg));
  const retry = () => {
    setLink('connecting');
    setAttempt((a) => a + 1);
  };
  return { link, send, retry };
}
