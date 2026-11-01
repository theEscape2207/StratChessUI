import { useState } from 'react';

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

export function CopyFen({ fen }: { fen: string }) {
  const [copied, setCopied] = useState<{ fen: string; ok: boolean }>();
  // Feedback belongs to the FEN it was about; a move clears it.
  const feedback = copied?.fen === fen ? copied : undefined;
  return (
    <>
      <button
        type="button"
        className="icon"
        aria-label="Copy FEN"
        title="Copy FEN"
        onClick={() => void copyText(fen).then((ok) => setCopied({ fen, ok }))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </svg>
      </button>
      <span className="copied" role="status" data-testid="copied">
        {feedback && (feedback.ok ? 'Copied' : "Couldn't copy")}
      </span>
    </>
  );
}
