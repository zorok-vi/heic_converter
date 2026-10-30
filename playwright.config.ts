import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8089',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ['--enable-automation', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1'] },
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.platform === 'win32' ? 'node scripts/server.mjs --port 8089 --no-open' : './start.sh --port 8089 --no-open',
    url: 'http://127.0.0.1:8089',
    reuseExistingServer: false,
  },
});
