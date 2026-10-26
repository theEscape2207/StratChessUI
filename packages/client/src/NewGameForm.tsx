import { useState, type FormEvent } from 'react';
import {
  LIMIT_RANGES,
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
  onStart: (request: NewGameRequest) => void;
};

/** Side, engine and search limit. Limits are shown as what they are, never as Elo. */
export function NewGameForm({ engines, onStart }: NewGameFormProps) {
  const [humanColor, setHumanColor] = useState<Color>('white');
  const [engineId, setEngineId] = useState(engines[0]?.id ?? '');
  const [kind, setKind] = useState<LimitKind>('movetimeMs');
  const [value, setValue] = useState(LIMIT_DEFAULTS.movetimeMs);
  const range = LIMIT_RANGES[kind];

  if (engines.length === 0) {
    return <p className="status">No engines are configured on the host (engines.json).</p>;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const bounded = Math.min(range.max, Math.max(range.min, Math.round(value)));
    setValue(bounded);
    const limit = kind === 'depth' ? { depth: bounded } : { movetimeMs: bounded };
    onStart({ humanColor, engineId, limit });
  };

  return (
    <form className="new-game" onSubmit={submit}>
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
      <button type="submit" className="primary">
        New game
      </button>
    </form>
  );
}
