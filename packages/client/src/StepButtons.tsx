import type { ReactNode } from 'react';

type StepButtonsProps = {
  /** The number of moves on the board: 0 is the start position. */
  step: number;
  last: number;
  onStep: (step: number) => void;
};

const PATHS = {
  first: <path d="M6 6v12M18 6l-6 6 6 6" />,
  previous: <path d="M15 6l-6 6 6 6" />,
  next: <path d="M9 6l6 6-6 6" />,
  last: <path d="M18 6v12M6 6l6 6-6 6" />,
};

/** GameReview's first, previous, next and last move. */
export function StepButtons({ step, last, onStep }: StepButtonsProps) {
  const targets: [string, number, ReactNode][] = [
    ['First move', 0, PATHS.first],
    ['Previous move', step - 1, PATHS.previous],
    ['Next move', step + 1, PATHS.next],
    ['Last move', last, PATHS.last],
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
