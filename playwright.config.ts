import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.MERLIN_BASE_URL || 'http://127.0.0.1:5180';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL,
    launchOptions: { executablePath: process.env.MERLIN_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
