import { useRef, useState } from 'react';
import {
  appendTranscript,
  START_FEN,
  type EngineChoice,
  type GameState,
  type SearchUpdate,
  type TranscriptLine,
} from '@stratchess-ui/shared';
import { Board } from './Board.tsx';
import { CopyFen } from './CopyFen.tsx';
import { MoveList } from './MoveList.tsx';
import { NewGameForm } from './NewGameForm.tsx';
import { PairForm } from './PairForm.tsx';
import { SearchInfo } from './SearchInfo.tsx';
import { Transcript } from './Transcript.tsx';
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
  const [search, setSearch] = useState<SearchUpdate>();
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  // The new-game form opened over a game in progress; set-up shows it anyway.
  const [setUp, setSetUp] = useState(false);
  const fenText = useRef<HTMLParagraphElement>(null);
  const { link, send, retry } = useGameSocket(
    token,
    (msg) => {
      if (msg.type === 'hello') return setEngines(msg.engines);
      if (msg.type === 'search') return setSearch({ fen: msg.fen, info: msg.info });
      if (msg.type === 'transcript') {
        const { lines, reset } = msg;
        return setTranscript((last) => appendTranscript(reset ? [] : last, lines));
      }
      if (msg.type === 'error') {
        setNotice(msg.reason);
        // Redraw the last server position to undo the board's optimistic move.
        setRevision((r) => r + 1);
        return;
      }
      setNotice('');
      setGame(msg.game);
      // The last search stays up until the engine starts on another position.
      const { phase, fen } = msg.game;
      if (phase === 'thinking') setSearch((last) => (last?.fen === fen ? last : undefined));
    },
    onUnpaired,
  );
  const humanColor = game?.humanColor ?? 'white';
  const fen = game?.fen ?? START_FEN;

  const ready = engines !== undefined && link === 'connected';
  const playing = game !== undefined && game.phase !== 'over';

  return (
    <main className="game">
      <div className="play">
        <Board
          fen={fen}
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
        {/* Selectable in one tap, for a browser that cannot copy on its own. */}
        <p className="status fen" data-testid="fen" ref={fenText}>
          {fen}
        </p>
      </div>
      <aside className="sidebar" aria-label="Game">
        <h2 className="sidebar-title">{game ? `Play ${game.engineName}` : 'New game'}</h2>
        {game && search && <SearchInfo fen={search.fen} info={search.info} />}
        <MoveList startFen={game?.startFen ?? START_FEN} moves={game?.moves ?? []} />
        {ready && playing && !setUp && (
          <div className="actions">
            <button type="button" data-testid="show-new-game" onClick={() => setSetUp(true)}>
              New game
            </button>
          </div>
        )}
        {ready && (
          <NewGameForm
            engines={engines}
            hidden={playing && !setUp}
            onStart={(request) => {
              // Until the new game arrives, the old one's status must not pass for it.
              setGame(undefined);
              setSearch(undefined);
              setSetUp(false);
              send({ type: 'new-game', ...request });
            }}
            onCancel={playing ? () => setSetUp(false) : undefined}
          />
        )}
        {/* Kept through a new game, so an open panel stays open; the server resets its lines. */}
        {(game || transcript.length > 0) && <Transcript lines={transcript} />}
        <div className="toolbar">
          <CopyFen fen={fen} text={fenText} />
        </div>
      </aside>
    </main>
  );
}
