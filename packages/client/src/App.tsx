import { useEffect, useRef, useState } from 'react';
import { START_FEN, type ClientMessage, type ServerMessage } from '@stratchess-ui/shared';
import { Board } from './Board.tsx';

export function App() {
  const socket = useRef<WebSocket | undefined>(undefined);
  const [fen, setFen] = useState(START_FEN);
  const [lastMove, setLastMove] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    socket.current = ws;
    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onmessage = (event: MessageEvent<string>) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === 'error') {
        setStatus(msg.reason);
        // Redraw the last server position to undo the board's optimistic move.
        setRevision((r) => r + 1);
        return;
      }
      setFen(msg.fen);
      setLastMove(msg.lastMove);
      setStatus(msg.outcome ? `game over: ${msg.outcome}` : 'connected');
    };
    return () => ws.close();
  }, []);

  const send = (msg: ClientMessage) => socket.current?.send(JSON.stringify(msg));

  return (
    <main>
      <Board
        fen={fen}
        lastMove={lastMove}
        revision={revision}
        onMove={(uci) => send({ type: 'move', uci })}
      />
      <p className="status" data-testid="status">
        {status}
      </p>
      <p className="status" data-testid="fen">
        {fen}
      </p>
      <button onClick={() => send({ type: 'new-game' })}>New game</button>
    </main>
  );
}
