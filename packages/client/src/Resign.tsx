export function ResignButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="stack" disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
      </svg>
      Resign
    </button>
  );
}

type ResignPromptProps = {
  disabled: boolean;
  onKeepPlaying: () => void;
  onResign: () => void;
};

/** Keep playing comes first, taking the place of the Resign just tapped: a double tap is safe. */
export function ResignPrompt({ disabled, onKeepPlaying, onResign }: ResignPromptProps) {
  return (
    <div className="actions resign-prompt">
      <p>Resign this game?</p>
      <button type="button" autoFocus onClick={onKeepPlaying}>
        Keep playing
      </button>
      <button type="button" disabled={disabled} onClick={onResign}>
        Resign
      </button>
    </div>
  );
}
