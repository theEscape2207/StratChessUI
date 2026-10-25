import { useEffect, useRef, useState } from 'react';
import {
  START_FEN,
  type ClientMessage,
  type EngineChoice,
  type GameState,
  type ServerMessage,
} from '@stratchess-ui/shared';
import { Board } from './Board.tsx';
import { NewGameForm } from './NewGameForm.tsx';

function describe(game: GameState | undefined): string {
  if (!game) return 'choose a side and start a game';
  switch (game.phase) {
    case 'starting':
      return `starting ${game.engineName}`;
    case 'human':
      return 'your move';
    case 'thinking':
      return `${game.engineName} thinking`;
    case 'over':
      if (game.reason) return `game over: ${game.reason}`;
      return game.result === 'draw' ? 'game over: draw' : `game over: ${game.result} wins`;
  }
}

export function App() {
  const socket = useRef<WebSocket | undefined>(undefined);
  const [connection, setConnection] = useState('connecting');
  const [engines, setEngines] = useState<EngineChoice[]>();
  const [game, setGame] = useState<GameState>();
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    socket.current = ws;
    ws.onopen = () => setConnection('connected');
    ws.onclose = () => setConnection('disconnected');
    ws.onmessage = (event: MessageEvent<string>) => {
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.type === 'hello') return setEngines(msg.engines);
      if (msg.type === 'error') {
        setNotice(msg.reason);
        // Redraw the last server position to undo the board's optimistic move.
        setRevision((r) => r + 1);
        return;
      }
      setNotice('');
      setGame(msg.game);
    };
    return () => ws.close();
  }, []);

  const send = (msg: ClientMessage) => socket.current?.send(JSON.stringify(msg));
  const humanColor = game?.humanColor ?? 'white';

  return (
    <main>
      <Board
        fen={game?.fen ?? START_FEN}
        lastMove={game?.lastMove}
        revision={revision}
        orientation={humanColor}
        movable={game?.phase === 'human' ? humanColor : undefined}
        onMove={(uci) => send({ type: 'move', uci })}
      />
      <p className="status" data-testid="status">
        {connection === 'connected' ? describe(game) : connection}
      </p>
      {notice && (
        <p className="status notice" data-testid="notice">
          {notice}
        </p>
      )}
      <p className="status" data-testid="fen">
        {game?.fen ?? START_FEN}
      </p>
      {engines && (
        <NewGameForm
          engines={engines}
          onStart={(request) => send({ type: 'new-game', ...request })}
        />
      )}
    </main>
  );
}
