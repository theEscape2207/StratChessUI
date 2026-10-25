import { defineConfig, devices } from '@playwright/test';

const PAIRING_CODE = '000000';
const PAIRED_STATE = 'test-results/paired.json';

// Runs against the built client served by the real server, as a phone on the LAN would see it.
export default defineConfig({
  testDir: 'packages/client/e2e',
  // One game per server: parallel tests would take it from each other.
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:8090', trace: 'retain-on-failure' },
  projects: [
    { name: 'setup', testMatch: 'pairing.setup.ts', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], storageState: PAIRED_STATE },
      dependencies: ['setup'],
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'], storageState: PAIRED_STATE },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:8090/api/health',
    env: { PORT: '8090', FAKE_ENGINE: 'legal', PAIRING_CODE },
    reuseExistingServer: !process.env.CI,
  },
});
