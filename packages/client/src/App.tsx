import { useState } from 'react';
import { START_FEN, type EngineChoice, type GameState } from '@stratchess-ui/shared';
import { Board } from './Board.tsx';
import { MoveList } from './MoveList.tsx';
import { NewGameForm } from './NewGameForm.tsx';
import { PairForm } from './PairForm.tsx';
import { useGameSocket, type Link } from './useGameSocket.ts';

const TOKEN_KEY = 'pairing-token';

const LINK_STATUS: Record<Exclude<Link, 'connected'>, string> = {
  connecting: 'connecting',
  reconnecting: 'disconnected, reconnecting',
  busy: 'another device is playing',
  replaced: 'opened in another tab',
};

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
      if (game.result === 'draw') return `game over: draw by ${game.termination}`;
      return `game over: ${game.result} wins by ${game.termination}`;
  }
}

/** Storage can be unavailable, as in some private windows; the browser then pairs every visit. */
function readToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeToken(token: string | undefined): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Paired for this page only.
  }
}

export function App() {
  const [token, setToken] = useState(readToken);
  const remember = (next: string | undefined) => {
    writeToken(next);
    setToken(next);
  };
  if (!token) {
    return (
      <main>
        <PairForm onPaired={remember} />
      </main>
    );
  }
  return <Game token={token} onUnpaired={() => remember(undefined)} />;
}

function Game({ token, onUnpaired }: { token: string; onUnpaired: () => void }) {
  const [engines, setEngines] = useState<EngineChoice[]>();
  const [game, setGame] = useState<GameState>();
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const { link, send, retry } = useGameSocket(
    token,
    (msg) => {
      if (msg.type === 'hello') return setEngines(msg.engines);
      if (msg.type === 'error') {
        setNotice(msg.reason);
        // Redraw the last server position to undo the board's optimistic move.
        setRevision((r) => r + 1);
        return;
      }
      setNotice('');
      setGame(msg.game);
    },
    onUnpaired,
  );
  const humanColor = game?.humanColor ?? 'white';

  return (
    <main className="game">
      <div className="play">
        <Board
          fen={game?.fen ?? START_FEN}
          lastMove={game?.lastMove}
          revision={revision}
          orientation={humanColor}
          movable={link === 'connected' && game?.phase === 'human' ? humanColor : undefined}
          onMove={(uci) => send({ type: 'move', uci })}
        />
        <p className={game?.phase === 'over' ? 'status result' : 'status'} data-testid="status">
          {link === 'connected' ? describe(game) : LINK_STATUS[link]}
        </p>
        {(link === 'busy' || link === 'replaced') && (
          <button type="button" onClick={retry}>
            {link === 'busy' ? 'Try again' : 'Play here'}
          </button>
        )}
        {notice && (
          <p className="status notice" data-testid="notice">
            {notice}
          </p>
        )}
      </div>
      <MoveList moves={game?.moves ?? []} />
      <div className="controls">
        <p className="status" data-testid="fen">
          {game?.fen ?? START_FEN}
        </p>
        {engines && link === 'connected' && (
          <NewGameForm
            engines={engines}
            onStart={(request) => {
              // Until the new game arrives, the old one's status must not pass for it.
              setGame(undefined);
              send({ type: 'new-game', ...request });
            }}
          />
        )}
      </div>
    </main>
  );
}
