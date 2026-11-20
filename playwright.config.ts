import { defineConfig } from '@playwright/test';
// Default suite exercises the real local API without launching a browser.
export default defineConfig({
  testDir: './tests/http',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4317' },
  webServer: {
    command: 'node scripts/test-server.cjs',
    // GET falls back to an empty dashboard without DB credentials.
    url: 'http://127.0.0.1:4317/api/invoices',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
