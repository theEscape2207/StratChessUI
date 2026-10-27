import { useLayoutEffect, useRef } from 'react';
import type { TranscriptLine } from '@stratchess-ui/shared';

const MARKS: Record<TranscriptLine['dir'], { mark: string; label: string }> = {
  sent: { mark: '→', label: 'sent' },
  received: { mark: '←', label: 'received' },
  stderr: { mark: '!', label: 'error output' },
};

/** The engine's UCI lines, read-only; it follows new lines while scrolled to the bottom. */
export function Transcript({ lines }: { lines: readonly TranscriptLine[] }) {
  const list = useRef<HTMLOListElement>(null);
  const following = useRef(true);

  useLayoutEffect(() => {
    const el = list.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <details
      className="transcript"
      data-testid="transcript"
      onToggle={() => {
        const el = list.current;
        if (el && following.current) el.scrollTop = el.scrollHeight;
      }}
    >
      <summary>UCI transcript</summary>
      <ol
        ref={list}
        onScroll={(event) => {
          const el = event.currentTarget;
          following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
        }}
      >
        {lines.map(({ dir, text }, i) => (
          <li key={i} className={dir}>
            <span className="mark" aria-label={MARKS[dir].label}>
              {MARKS[dir].mark}
            </span>
            {text}
          </li>
        ))}
      </ol>
    </details>
  );
}
