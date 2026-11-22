import { useState, type ReactNode } from 'react';

/**
 * The Clipboard API exists only in a secure context, which plain HTTP on the LAN is not, and can
 * reject where it does exist; the deprecated execCommand copies from a selection instead.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // On to execCommand.
    }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  // Fixed and unseen, so selecting it neither scrolls the page nor shows; iOS needs a range.
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

type Copyable = { label: string; text: string; icon: ReactNode };

const FEN_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </svg>
);

const PGN_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5M9 12h6M9 16h6" />
  </svg>
);

/** One status after the icons: one beside each would push the next icon aside as it appears. */
export function CopyTools({ fen, pgn }: { fen: string; pgn: string | undefined }) {
  const items: Copyable[] = [{ label: 'Copy FEN', text: fen, icon: FEN_ICON }];
  if (pgn !== undefined) items.push({ label: 'Copy PGN', text: pgn, icon: PGN_ICON });
  const [copied, setCopied] = useState<Omit<Copyable, 'icon'> & { ok: boolean }>();
  // Feedback belongs to the text it was about; a move changes both, which clears it.
  const feedback = items.some((item) => item.label === copied?.label && item.text === copied.text)
    ? copied
    : undefined;
  return (
    <>
      {items.map(({ label, text, icon }) => (
        <button
          key={label}
          type="button"
          className="icon"
          aria-label={label}
          title={label}
          onClick={() => void copyText(text).then((ok) => setCopied({ label, text, ok }))}
        >
          {icon}
        </button>
      ))}
      <span className="copied" role="status" data-testid="copied">
        {feedback && (feedback.ok ? 'Copied' : "Couldn't copy")}
      </span>
    </>
  );
}
