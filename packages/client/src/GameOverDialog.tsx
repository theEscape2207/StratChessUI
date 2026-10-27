import type { GameOverText } from './gameover.ts';

type GameOverDialogProps = GameOverText & {
  onNewGame: () => void;
  onClose: () => void;
};

/** Over the board when the server ends the game; a tap on the scrim closes it like ×. */
export function GameOverDialog({ title, line, onNewGame, onClose }: GameOverDialogProps) {
  return (
    <div className="game-over" data-testid="game-over-scrim" onClick={onClose}>
      <div
        className="game-over-card"
        role="dialog"
        aria-labelledby="game-over-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="game-over-top">
          <h2 id="game-over-title">{title}</h2>
          <p className="game-over-line" data-testid="game-over-line">
            {line}
          </p>
          <button type="button" className="icon" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="game-over-actions">
          <button type="button" className="primary" onClick={onNewGame}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}
