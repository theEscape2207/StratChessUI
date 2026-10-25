import { defineConfig, devices } from '@playwright/test';

// Runs against the built client served by the real server, as a phone on the LAN would see it.
export default defineConfig({
  testDir: 'packages/client/e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:8090', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:8090/api/health',
    env: { PORT: '8090', FAKE_ENGINE: 'legal' },
    reuseExistingServer: !process.env.CI,
  },
});
