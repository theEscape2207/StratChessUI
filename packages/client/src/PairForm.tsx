import { useState, type FormEvent } from 'react';

type PairFormProps = { onPaired: (token: string) => void };

/** Asks for the code the host prints; the token it earns is kept until the host revokes it. */
export function PairForm({ onPaired }: PairFormProps) {
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const res = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });
    const body = (await res.json()) as { token?: string; reason?: string };
    if (body.token) return onPaired(body.token);
    setNotice(body.reason ?? `pairing failed (${res.status})`);
  };

  return (
    <>
      <div className="wordmark">
        <span className="wordmark-mark" aria-hidden="true" />
        StratChess
      </div>
      <form className="pair-card" onSubmit={(e) => void submit(e)}>
        <h1>Pair this device</h1>
        <p className="pair-hint">
          Type the 6-digit code shown in the host's console. You only do this once on each phone or
          tablet.
        </p>
        <label>
          Pairing code from the host
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button type="submit" className="primary">
          Pair
        </button>
        {notice && (
          <p className="status notice" data-testid="notice">
            {notice}
          </p>
        )}
      </form>
    </>
  );
}
