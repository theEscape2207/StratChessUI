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
    <form className="new-game" onSubmit={(e) => void submit(e)}>
      <label>
        Pairing code from the host
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <button type="submit">Pair</button>
      {notice && (
        <p className="status notice" data-testid="notice">
          {notice}
        </p>
      )}
    </form>
  );
}
