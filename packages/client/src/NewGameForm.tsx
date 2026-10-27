import { useState, type FormEvent } from 'react';
import {
  LIMIT_RANGES,
  MAX_FEN_LENGTH,
  parseStartFen,
  turn,
  type Color,
  type EngineChoice,
  type NewGameRequest,
} from '@stratchess-ui/shared';

type LimitKind = keyof typeof LIMIT_RANGES;

const LIMIT_LABELS: Record<LimitKind, string> = {
  depth: 'Depth (plies)',
  movetimeMs: 'Move time (ms)',
};
const LIMIT_DEFAULTS: Record<LimitKind, number> = { depth: 8, movetimeMs: 1000 };

type NewGameFormProps = {
  engines: EngineChoice[];
  /** Hidden rather than unmounted during play, so the next game starts from the same settings. */
  hidden: boolean;
  onStart: (request: NewGameRequest) => void;
  /** Offered when the form was opened over a game in progress, to go back to it. */
  onCancel?: () => void;
};

/**
 * Side, engine, search limit and an optional start position. Limits are shown as what they are,
 * never as Elo. The FEN is checked here for feedback; the server checks it again.
 */
export function NewGameForm({ engines, hidden, onStart, onCancel }: NewGameFormProps) {
  const [humanColor, setHumanColor] = useState<Color>('white');
  const [engineId, setEngineId] = useState(engines[0]?.id ?? '');
  const [kind, setKind] = useState<LimitKind>('movetimeMs');
  const [value, setValue] = useState(LIMIT_DEFAULTS.movetimeMs);
  const [fen, setFen] = useState('');
  const [fenError, setFenError] = useState('');
  const range = LIMIT_RANGES[kind];

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
    const limit = kind === 'depth' ? { depth: bounded } : { movetimeMs: bounded };
    if (!fen.trim()) return onStart({ humanColor, engineId, limit });
    const start = parseStartFen(fen);
    if (!start.ok) return setFenError(start.reason);
    onStart({ humanColor, engineId, limit, fen: start.fen });
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
        <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Limit
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value as LimitKind;
            setKind(next);
            setValue(LIMIT_DEFAULTS[next]);
          }}
        >
          {(Object.keys(LIMIT_LABELS) as LimitKind[]).map((k) => (
            <option key={k} value={k}>
              {LIMIT_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {LIMIT_LABELS[kind]}
        <input
          type="number"
          min={range.min}
          max={range.max}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
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
      <button type="submit" className="primary">
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
