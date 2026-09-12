import { defineConfig } from '@playwright/test';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3001';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL },
  workers: 1,
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
