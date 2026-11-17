import { readFile } from 'node:fs/promises';
import { test as base } from '@playwright/test';
import { pairedState, serverURL } from './servers.ts';

type Paired = {
  cookies: [];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

/** What a browser that opened More and asked for the search line has stored. */
const MORE_OPEN = [
  { name: 'more-open', value: '1' },
  { name: 'search-line', value: '1' },
];

/** Points each worker at its own server, paired by pair-servers.ts. */
export const test = base.extend<{ more: 'open' | 'untouched' }>({
  // Open by default: most tests reach for a field that More holds. more.spec.ts covers a browser
  // that has never opened it.
  more: ['open', { option: true }],
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use, testInfo) => use(serverURL(testInfo.parallelIndex)),
  storageState: async ({ more }, use, testInfo) => {
    const state: Paired = JSON.parse(await readFile(pairedState(testInfo.parallelIndex), 'utf8'));
    if (more === 'open')
      for (const { localStorage } of state.origins) localStorage.push(...MORE_OPEN);
    await use(state);
  },
});
export { expect } from '@playwright/test';
