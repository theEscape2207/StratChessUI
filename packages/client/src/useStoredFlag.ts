import { useCallback, useState } from 'react';

function read(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function write(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // Kept for this page only.
  }
}

/** A choice this browser remembers, off until made. Storage can be unavailable, as for the token. */
export function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => read(key));
  const set = useCallback(
    (next: boolean) => {
      write(key, next);
      setOn(next);
    },
    [key],
  );
  return [on, set];
}
