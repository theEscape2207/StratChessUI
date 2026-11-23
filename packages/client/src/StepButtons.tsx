import type { ReactNode } from 'react';

type StepButtonsProps = {
  /** The number of moves on the board: 0 is the start position. */
  step: number;
  /** The game's number of moves, its final position. */
  last: number;
  onStep: (step: number) => void;
};

/** GameReview's first, previous, next and last move. */
export function StepButtons({ step, last, onStep }: StepButtonsProps) {
  const targets: [string, number, ReactNode][] = [
    ['First move', 0, <path d="M6 6v12M18 6l-6 6 6 6" />],
    ['Previous move', step - 1, <path d="M15 6l-6 6 6 6" />],
    ['Next move', step + 1, <path d="M9 6l6 6-6 6" />],
    ['Last move', last, <path d="M18 6v12M6 6l6 6-6 6" />],
  ];
  return (
    <>
      {targets.map(([label, target, path]) => (
        <button
          key={label}
          type="button"
          className="icon"
          aria-label={label}
          title={label}
          disabled={target === step || target < 0 || target > last}
          onClick={() => onStep(target)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {path}
          </svg>
        </button>
      ))}
    </>
  );
}
