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

/** Ties the fields outside the form element to it, so Enter in one still starts the game. */
const FORM_ID = 'new-game';

function strengthOf(kind: LimitKind, value: number): Strength {
  if (kind === 'level') return { level: value };
  return { limit: kind === 'depth' ? { depth: value } : { movetimeMs: value } };
}

/**
 * The new-game settings, held above the form so that its less-used fields can sit elsewhere on the
 * page and the next game starts from the same settings. What the user has not chosen follows the
 * engine list, which arrives after the first render. The FEN is checked here for feedback; the
 * server checks it again.
 */
export function useNewGameSettings(
  engines: readonly EngineChoice[],
  onStart: (request: NewGameRequest) => void,
  onFenRefused: () => void,
) {
  const [humanColor, setHumanColor] = useState<Color>('white');
  const [engineChoice, setEngineChoice] = useState<string>();
  const [kindChoice, setKindChoice] = useState<LimitKind>();
  const [valueChoice, setValueChoice] = useState<number>();
  const [analysis, setAnalysis] = useState(true);
  const [fen, setFen] = useState('');
  const [fenError, setFenError] = useState('');

  const hasLevels = (id: string) => engines.find((engine) => engine.id === id)?.levels === true;
  const engineId = engines.find((engine) => engine.id === engineChoice)?.id ?? engines[0]?.id ?? '';
  const levels = hasLevels(engineId);
  const kind: LimitKind =
    kindChoice && (kindChoice !== 'level' || levels) ? kindChoice : levels ? 'level' : 'movetimeMs';
  const value = valueChoice ?? LIMIT_DEFAULTS[kind];
  const range = RANGES[kind];

  const changeKind = (next: LimitKind) => {
    setKindChoice(next);
    setValueChoice(undefined);
  };

  return {
    engines,
    humanColor,
    setHumanColor,
    engineId,
    kind,
    kinds: (Object.keys(LIMIT_LABELS) as LimitKind[]).filter((k) => k !== 'level' || levels),
    range,
    value,
    setValue: setValueChoice,
    analysis,
    setAnalysis,
    fen,
    fenError,
    changeKind,
    changeEngine(id: string) {
      setEngineChoice(id);
      if (hasLevels(id) && kind !== 'level') changeKind('level');
      if (!hasLevels(id) && kind === 'level') changeKind('movetimeMs');
    },
    changeFen(next: string) {
      setFen(next);
      setFenError('');
      const start = parseStartFen(next);
      if (start.ok) setHumanColor(turn(start.fen));
    },
    submit(event: FormEvent) {
      event.preventDefault();
      const bounded = Math.min(range.max, Math.max(range.min, Math.round(value)));
      setValueChoice(bounded);
      // The server accepts only `true`; off is the key left out.
      const request = {
        humanColor,
        engineId,
        ...strengthOf(kind, bounded),
        ...(analysis && { analysis }),
      };
      if (!fen.trim()) return onStart(request);
      const start = parseStartFen(fen);
      if (!start.ok) {
        setFenError(start.reason);
        return onFenRefused();
      }
      onStart({ ...request, fen: start.fen });
    },
  };
}

type Settings = ReturnType<typeof useNewGameSettings>;

type NewGameFormProps = {
  settings: Settings;
  /** Hidden rather than unmounted during play, so the submit button keeps its ref. */
  hidden: boolean;
  /** Offered when the form was opened over a game in progress, to go back to it. */
  onCancel?: () => void;
  submitRef?: Ref<HTMLButtonElement>;
};

/**
 * Side, engine and the limit's value or level: what a game needs chosen. Limits and levels are
 * shown as what they are, never as Elo.
 */
export function NewGameForm({ settings, hidden, onCancel, submitRef }: NewGameFormProps) {
  const { engines, humanColor, engineId, kind, range, value } = settings;

  if (engines.length === 0) {
    return (
      <p className="status" hidden={hidden}>
        No engines are configured on the host (engines.json).
      </p>
    );
  }

  return (
    <form id={FORM_ID} className="new-game" hidden={hidden} onSubmit={settings.submit}>
      <fieldset>
        <legend>You play</legend>
        {(['white', 'black'] as const).map((color) => (
          <label key={color}>
            <input
              type="radio"
              name="side"
              checked={humanColor === color}
              onChange={() => settings.setHumanColor(color)}
            />
            {color}
          </label>
        ))}
      </fieldset>
      <label>
        Engine
        <select value={engineId} onChange={(e) => settings.changeEngine(e.target.value)}>
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {LIMIT_LABELS[kind]}
        {kind === 'level' ? (
          <select value={value} onChange={(e) => settings.setValue(Number(e.target.value))}>
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
            onChange={(e) => settings.setValue(Number(e.target.value))}
          />
        )}
      </label>
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

export function FeedbackField({ settings }: { settings: Settings }) {
  return (
    <label className="check-field">
      <input
        type="checkbox"
        form={FORM_ID}
        checked={settings.analysis}
        onChange={(e) => settings.setAnalysis(e.target.checked)}
      />
      Move Feedback
    </label>
  );
}

/** The limit's kind and an optional start position. */
export function StartFields({ settings }: { settings: Settings }) {
  const { kind, kinds, fen, fenError } = settings;
  return (
    <>
      <label>
        Limit
        <select
          form={FORM_ID}
          value={kind}
          onChange={(e) => settings.changeKind(e.target.value as LimitKind)}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {LIMIT_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="fen-field">
        Start position (FEN, empty for the standard one)
        <input
          type="text"
          form={FORM_ID}
          value={fen}
          maxLength={MAX_FEN_LENGTH}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-invalid={fenError !== ''}
          onChange={(e) => settings.changeFen(e.target.value)}
        />
      </label>
      {fenError && (
        <p className="fen-error notice" role="alert" data-testid="fen-error">
          {fenError}
        </p>
      )}
    </>
  );
}
