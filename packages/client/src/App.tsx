import { useMemo, useRef, useState } from 'react';
import {
  appendTranscript,
  canResign,
  canTakeBack,
  capturedPieces,
  materialBalance,
  START_FEN,
  type EngineChoice,
  type GameState,
  type Score,
  type SearchUpdate,
  type TranscriptLine,
} from '@stratchess-ui/shared';
import { Board } from './Board.tsx';
import { CopyFen } from './CopyFen.tsx';
import { EvalBar } from './EvalBar.tsx';
import { GameOverDialog } from './GameOverDialog.tsx';
import { gameOverText } from './gameover.ts';
import { nextEval } from './eval.ts';
import { MoveList } from './MoveList.tsx';
import { NewGameForm } from './NewGameForm.tsx';
import { PairForm } from './PairForm.tsx';
import { PlayerStrip } from './PlayerStrip.tsx';
import { ResignButton, ResignPrompt } from './Resign.tsx';
import { SearchInfo } from './SearchInfo.tsx';
import { materialLead, strengthLabel, stripChip } from './strip.ts';
import { Transcript } from './Transcript.tsx';
import { UndoButton } from './UndoButton.tsx';
import { useGameSocket, type Link } from './useGameSocket.ts';

const TOKEN_KEY = 'pairing-token';

const LINK_STATUS: Record<Exclude<Link, 'connected'>, string> = {
  connecting: 'connecting',
  reconnecting: 'disconnected, reconnecting',
  replaced: 'opened in another tab',
};

/** The server holds a game until the browser replaces it, so only a server restart loses one. */
const GAME_SAFE_STATUS = 'disconnected, your game is safe, reconnecting';
const GAME_LOST_NOTICE = 'the game ended because the server restarted';

function describeEnd(game: GameState): string {
  if (game.reason) return `game over: ${game.reason}`;
  if (game.result === 'draw') return `game over: draw by ${game.termination}`;
  return `game over: ${game.result} wins by ${game.termination}`;
}

/**
 * Only what the strips' chips and the dialog cannot say: chips go stale without a connection, and
 * after a game say just "won", "lost", "draw" or "ended".
 */
function statusLine(link: Link, game: GameState | undefined, dialogOpen: boolean) {
  // A retry passes through "connecting", which on a dead network can outlast the wait between tries.
  const retrying = link === 'reconnecting' || link === 'connecting';
  if (retrying && game && game.phase !== 'over') {
    return { text: GAME_SAFE_STATUS, className: 'status' };
  }
  if (link !== 'connected') return { text: LINK_STATUS[link], className: 'status' };
  return game?.phase === 'over' && !dialogOpen
    ? { text: describeEnd(game), className: 'status result' }
    : undefined;
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
      <main className="pair-screen">
        <PairForm onPaired={remember} />
      </main>
    );
  }
  return <Game token={token} onUnpaired={() => remember(undefined)} />;
}

/**
 * The engine's strip on the far side of the board and the human's on the near side. Without a game
 * their rows stay empty: the board must not move when one starts, as Chessground keeps its bounds
 * until a scroll or resize.
 */
function playerStrips(game: GameState | undefined) {
  if (!game) {
    return {
      engine: <div className="player-strip engine" />,
      human: <div className="player-strip human" />,
    };
  }
  const engineColor = game.humanColor === 'white' ? 'black' : 'white';
  const captured = capturedPieces(game.startFen, game.moves);
  const balance = materialBalance(game.fen);
  return {
    engine: (
      <PlayerStrip
        side="engine"
        name={game.engineIdName ?? game.engineName}
        detail={strengthLabel(game)}
        captured={captured[engineColor]}
        capturedColor={game.humanColor}
        lead={materialLead(balance, engineColor)}
        chip={stripChip(game, 'engine')}
      />
    ),
    human: (
      <PlayerStrip
        side="human"
        name="You"
        detail={game.humanColor}
        captured={captured[game.humanColor]}
        capturedColor={engineColor}
        lead={materialLead(balance, game.humanColor)}
        chip={stripChip(game, 'human')}
      />
    ),
  };
}

function Game({ token, onUnpaired }: { token: string; onUnpaired: () => void }) {
  const [engines, setEngines] = useState<EngineChoice[]>();
  const [game, setGame] = useState<GameState>();
  const [search, setSearch] = useState<SearchUpdate>();
  // Unlike the search, kept through the engine's turns until a new game.
  const [evalScore, setEvalScore] = useState<Score>();
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  // Opened over a game in progress; with no game, or after one, the form shows anyway.
  const [formOpen, setFormOpen] = useState(false);
  // Whether this page saw the current game in play, so a game already over at load opens no dialog.
  const inPlay = useRef(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  // From the tap until the server answers, so a double tap cannot take back two turns, nor a move
  // made meanwhile land on the rewound position.
  const [undoSent, setUndoSent] = useState(false);
  const [resignAsked, setResignAsked] = useState(false);
  const newGameButton = useRef<HTMLButtonElement>(null);
  const clearGame = () => {
    setGame(undefined);
    setSearch(undefined);
    setEvalScore(undefined);
    setFormOpen(false);
    setGameOverOpen(false);
    setUndoSent(false);
    setResignAsked(false);
  };
  const { link, send, retry } = useGameSocket(
    token,
    (msg) => {
      if (msg.type === 'hello') {
        setEngines(msg.engines);
        if (game && !msg.hasGame) {
          clearGame();
          setTranscript([]);
          setNotice(GAME_LOST_NOTICE);
        }
        return;
      }
      if (msg.type === 'search') {
        setEvalScore((last) => nextEval(last, msg.info));
        return setSearch({ fen: msg.fen, info: msg.info });
      }
      if (msg.type === 'transcript') {
        const { lines, reset } = msg;
        return setTranscript((last) => appendTranscript(reset ? [] : last, lines));
      }
      if (msg.type === 'error') {
        setNotice(msg.reason);
        setUndoSent(false);
        // Redraw the last server position to undo the board's optimistic move.
        setRevision((r) => r + 1);
        return;
      }
      setNotice('');
      setUndoSent(false);
      // What the engine said was about moves that are gone. The server has forgotten it too.
      if (game && msg.game.moves.length < game.moves.length) {
        setSearch(undefined);
        setEvalScore(undefined);
      }
      setGame(msg.game);
      // The last search stays up until the engine starts on another position.
      const { phase, fen } = msg.game;
      if (phase === 'over' && inPlay.current) setGameOverOpen(true);
      if (phase === 'over') setResignAsked(false);
      inPlay.current = phase !== 'over';
      if (phase === 'thinking') setSearch((last) => (last?.fen === fen ? last : undefined));
    },
    onUnpaired,
  );
  const humanColor = game?.humanColor ?? 'white';
  const fen = game?.fen ?? START_FEN;

  const ready = engines !== undefined && link === 'connected';
  const playing = game !== undefined && game.phase !== 'over';
  const formHidden = playing && !formOpen;
  // Replays the game, so once per game state rather than on each search line.
  const strips = useMemo(() => playerStrips(game), [game]);
  const status = statusLine(link, game, gameOverOpen);

  return (
    <main className="game">
      <EvalBar score={evalScore} orientation={humanColor} />
      <div className="play">
        {strips.engine}
        <Board
          fen={fen}
          lastMove={game?.lastMove}
          revision={revision}
          orientation={humanColor}
          movable={
            link === 'connected' && game?.phase === 'human' && !undoSent ? humanColor : undefined
          }
          onMove={(uci) => send({ type: 'move', uci })}
        >
          {gameOverOpen && game?.phase === 'over' && (
            <GameOverDialog
              {...gameOverText(game)}
              onClose={() => setGameOverOpen(false)}
              onNewGame={() => {
                setGameOverOpen(false);
                // The form shows after a game, keeping the last settings: a rematch is one tap.
                newGameButton.current?.focus();
              }}
            />
          )}
        </Board>
        {strips.human}
        <div className="play-info">
          {status && (
            <p className={status.className} data-testid="status">
              {status.text}
            </p>
          )}
          {link === 'replaced' && (
            <button type="button" onClick={retry}>
              Play here
            </button>
          )}
          {notice && (
            <p className="status notice" data-testid="notice">
              {notice}
            </p>
          )}
        </div>
      </div>
      <aside className="sidebar" aria-label="Game">
        <h2 className="sidebar-title">{game ? `Play ${game.engineName}` : 'New game'}</h2>
        {game && search && <SearchInfo fen={search.fen} info={search.info} />}
        <MoveList startFen={game?.startFen ?? START_FEN} moves={game?.moves ?? []} />
        {game && resignAsked && (
          <ResignPrompt
            disabled={link !== 'connected'}
            onKeepPlaying={() => setResignAsked(false)}
            onResign={() => {
              setResignAsked(false);
              send({ type: 'resign' });
            }}
          />
        )}
        {game && !resignAsked && (
          <div className="actions">
            <ResignButton
              disabled={link !== 'connected' || !canResign(game)}
              onClick={() => setResignAsked(true)}
            />
            <UndoButton
              disabled={link !== 'connected' || undoSent || !canTakeBack(game)}
              onClick={() => {
                setUndoSent(true);
                send({ type: 'takeback' });
              }}
            />
            {ready && formHidden && (
              <button type="button" data-testid="show-new-game" onClick={() => setFormOpen(true)}>
                New game
              </button>
            )}
          </div>
        )}
        {ready && (
          <NewGameForm
            engines={engines}
            hidden={formHidden}
            onStart={(request) => {
              // Until the new game arrives, the old one's status must not pass for it.
              clearGame();
              // A start position that is already over ends the game in its first state.
              inPlay.current = true;
              send({ type: 'new-game', ...request });
            }}
            onCancel={playing ? () => setFormOpen(false) : undefined}
            submitRef={newGameButton}
          />
        )}
        {/* Kept through a new game, so an open panel stays open; the server resets its lines. */}
        {(game || transcript.length > 0) && <Transcript lines={transcript} />}
        <div className="toolbar">
          <CopyFen fen={fen} />
        </div>
      </aside>
    </main>
  );
}
