import { defineConfig, devices } from '@playwright/test';

const localBaseUrl = process.env.E2E_LOCAL_URL ?? 'http://127.0.0.1:4173';
const skipLocalServer = process.env.E2E_SKIP_LOCAL_SERVER === '1';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'local',
      testMatch: /local\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: localBaseUrl,
      },
    },
    {
      name: 'deployed',
      testMatch: /deployed\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.E2E_BASE_URL ?? 'https://linegra.app',
      },
    },
  ],
  webServer: skipLocalServer
    ? undefined
    : {
        command: 'npm run preview -- --port 4173 --strictPort',
        url: localBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
