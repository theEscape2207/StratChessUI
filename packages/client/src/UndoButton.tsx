export function UndoButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="stack" disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 14L4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
      </svg>
      Undo
    </button>
  );
}
