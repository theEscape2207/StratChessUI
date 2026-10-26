import { useRef, useState } from 'react';

/**
 * The Clipboard API exists only in a secure context, which plain HTTP on the LAN is not; there the
 * deprecated execCommand copies from a selection instead.
 */
async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
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

/** The current position as a FEN, with a button that copies it. */
export function CopyFen({ fen }: { fen: string }) {
  const text = useRef<HTMLParagraphElement>(null);
  const [copied, setCopied] = useState<{ fen: string; ok: boolean }>();
  // Feedback belongs to the FEN it was about; a move clears it.
  const feedback = copied?.fen === fen ? copied : undefined;
  return (
    <>
      <p className="status fen" data-testid="fen" ref={text}>
        {fen}
      </p>
      <button
        type="button"
        onClick={() =>
          void copyText(fen).then((ok) => {
            // Left selected, the FEN is one tap on the system's own Copy away.
            if (!ok && text.current) getSelection()?.selectAllChildren(text.current);
            setCopied({ fen, ok });
          })
        }
      >
        Copy FEN
      </button>
      <span className="copied" role="status" data-testid="copied">
        {feedback && (feedback.ok ? 'Copied' : 'Copy the selected FEN')}
      </span>
    </>
  );
}
