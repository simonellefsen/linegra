import { defineConfig, devices } from '@playwright/test';
import { vercelProtectionBypassHeaders } from './lib/e2eVercelHeaders';

const localBaseUrl = process.env.E2E_LOCAL_URL ?? 'http://127.0.0.1:4173';
const deployedBaseUrl = process.env.E2E_BASE_URL;
const skipLocalServer = process.env.E2E_SKIP_LOCAL_SERVER === '1';
const useDeployedAuth = Boolean(process.env.E2E_ACCESS_TOKEN);
const deployedBypassHeaders = vercelProtectionBypassHeaders();

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
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
        baseURL: deployedBaseUrl,
        extraHTTPHeaders: deployedBypassHeaders,
        storageState: useDeployedAuth ? 'e2e/.auth/storageState.json' : undefined,
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
