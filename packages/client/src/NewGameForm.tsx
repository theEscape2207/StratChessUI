import { useState, type FormEvent, type Ref } from 'react';
import {
  LEVEL_RANGE,
  LIMIT_RANGES,
  MAX_FEN_LENGTH,
  parseStartFen,
  turn,
  type Color,
  type EngineChoice,
  type NewGameRequest,
  type Strength,
} from '@stratchess-ui/shared';

/** A search limit, or `level` for the beginner opponent, which only a profile with levels plays. */
type LimitKind = keyof typeof LIMIT_RANGES | 'level';

const LIMIT_LABELS: Record<LimitKind, string> = {
  depth: 'Depth (plies)',
  movetimeMs: 'Move time (ms)',
  level: 'Level',
};
const RANGES: Record<LimitKind, { min: number; max: number }> = {
  ...LIMIT_RANGES,
  level: LEVEL_RANGE,
};
const LIMIT_DEFAULTS: Record<LimitKind, number> = { depth: 8, movetimeMs: 1000, level: 2 };
const LEVELS = Array.from(
  { length: LEVEL_RANGE.max - LEVEL_RANGE.min + 1 },
  (_, i) => LEVEL_RANGE.min + i,
);

function strengthOf(kind: LimitKind, value: number): Strength {
  if (kind === 'level') return { level: value };
  return { limit: kind === 'depth' ? { depth: value } : { movetimeMs: value } };
}

type NewGameFormProps = {
  engines: EngineChoice[];
  /** Hidden rather than unmounted during play, so the next game starts from the same settings. */
  hidden: boolean;
  onStart: (request: NewGameRequest) => void;
  /** Offered when the form was opened over a game in progress, to go back to it. */
  onCancel?: () => void;
  submitRef?: Ref<HTMLButtonElement>;
};

/**
 * Side, engine, search limit or level, and an optional start position. Limits and levels are shown
 * as what they are, never as Elo. The FEN is checked here for feedback; the server checks it again.
 */
export function NewGameForm({ engines, hidden, onStart, onCancel, submitRef }: NewGameFormProps) {
  const [humanColor, setHumanColor] = useState<Color>('white');
  const [engineId, setEngineId] = useState(engines[0]?.id ?? '');
  const [kind, setKind] = useState<LimitKind>(engines[0]?.levels ? 'level' : 'movetimeMs');
  const [value, setValue] = useState(LIMIT_DEFAULTS[kind]);
  const [fen, setFen] = useState('');
  const [fenError, setFenError] = useState('');
  const range = RANGES[kind];
  const hasLevels = engines.find((engine) => engine.id === engineId)?.levels === true;
  const kinds = (Object.keys(LIMIT_LABELS) as LimitKind[]).filter(
    (k) => k !== 'level' || hasLevels,
  );

  if (engines.length === 0) {
    return (
      <p className="status" hidden={hidden}>
        No engines are configured on the host (engines.json).
      </p>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const bounded = Math.min(range.max, Math.max(range.min, Math.round(value)));
    setValue(bounded);
    const strength = strengthOf(kind, bounded);
    if (!fen.trim()) return onStart({ humanColor, engineId, ...strength });
    const start = parseStartFen(fen);
    if (!start.ok) return setFenError(start.reason);
    onStart({ humanColor, engineId, ...strength, fen: start.fen });
  };

  const changeKind = (next: LimitKind) => {
    setKind(next);
    setValue(LIMIT_DEFAULTS[next]);
  };

  const changeEngine = (id: string) => {
    setEngineId(id);
    const levels = engines.find((engine) => engine.id === id)?.levels === true;
    if (levels && kind !== 'level') changeKind('level');
    if (!levels && kind === 'level') changeKind('movetimeMs');
  };

  const changeFen = (next: string) => {
    setFen(next);
    setFenError('');
    const start = parseStartFen(next);
    if (start.ok) setHumanColor(turn(start.fen));
  };

  return (
    <form className="new-game" hidden={hidden} onSubmit={submit}>
      <fieldset>
        <legend>You play</legend>
        {(['white', 'black'] as const).map((color) => (
          <label key={color}>
            <input
              type="radio"
              name="side"
              checked={humanColor === color}
              onChange={() => setHumanColor(color)}
            />
            {color}
          </label>
        ))}
      </fieldset>
      <label>
        Engine
        <select value={engineId} onChange={(e) => changeEngine(e.target.value)}>
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Limit
        <select value={kind} onChange={(e) => changeKind(e.target.value as LimitKind)}>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {LIMIT_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {LIMIT_LABELS[kind]}
        {kind === 'level' ? (
          <select value={value} onChange={(e) => setValue(Number(e.target.value))}>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="number"
            min={range.min}
            max={range.max}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
          />
        )}
      </label>
      <label className="fen-field">
        Start position (FEN, empty for the standard one)
        <input
          type="text"
          value={fen}
          maxLength={MAX_FEN_LENGTH}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-invalid={fenError !== ''}
          onChange={(e) => changeFen(e.target.value)}
        />
      </label>
      {fenError && (
        <p className="fen-error notice" role="alert" data-testid="fen-error">
          {fenError}
        </p>
      )}
      <button type="submit" className="primary" ref={submitRef}>
        New game
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}
