import { test as base } from '@playwright/test';
import { pairedState, serverURL } from './servers.ts';

/** Points each worker at its own server, paired by pair-servers.ts. */
export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  baseURL: async ({}, use, testInfo) => use(serverURL(testInfo.parallelIndex)),
  // eslint-disable-next-line no-empty-pattern
  storageState: async ({}, use, testInfo) => use(pairedState(testInfo.parallelIndex)),
});
export { expect } from '@playwright/test';
