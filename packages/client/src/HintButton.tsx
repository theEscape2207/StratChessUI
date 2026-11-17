type HintButtonProps = {
  /** Turns a hint can still be asked for, shown beside the label. */
  left: number;
  disabled: boolean;
  onClick: () => void;
};

export function HintButton({ left, disabled, onClick }: HintButtonProps) {
  return (
    <button type="button" className="stack" disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
      </svg>
      <span>
        Hint{' '}
        <span className="hints-left" data-testid="hints-left">
          {left}
        </span>
      </span>
    </button>
  );
}
