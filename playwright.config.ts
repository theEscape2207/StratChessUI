import { defineConfig, devices } from '@playwright/test';
import {
  BOARD_SERVERS,
  PAIRING_CODE,
  pairingURL,
  serverPort,
  serverURL,
} from './packages/client/e2e/servers.ts';

// Runs against the built client served by the real server, as a phone on the LAN would see it.
export default defineConfig({
  testDir: 'packages/client/e2e',
  // Each worker plays on its own server (fixtures.ts), so there can be no more than there are.
  workers: BOARD_SERVERS,
  fullyParallel: true,
  globalSetup: './packages/client/e2e/pair-servers.ts',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'pairing',
      testMatch: 'pairing.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: pairingURL },
    },
    { name: 'desktop', testMatch: 'board.spec.ts', use: devices['Desktop Chrome'] },
    { name: 'phone', testMatch: 'board.spec.ts', use: devices['Pixel 7'] },
  ],
  // Playwright starts these in order, so only the first has to build the client.
  webServer: Array.from({ length: BOARD_SERVERS + 1 }, (_, index) => ({
    command: index === 0 ? 'npm run build && npm start' : 'npm start',
    url: `${serverURL(index)}/api/health`,
    env: { PORT: String(serverPort(index)), FAKE_ENGINE: 'legal', PAIRING_CODE },
    reuseExistingServer: !process.env.CI,
  })),
});
