import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    // 本地用系统 Edge；CI（Linux）用内置 Chromium
    ...(process.env.E2E_BROWSER === 'chromium' ? {} : { channel: 'msedge' }),
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  reporter: [['list']],
  outputDir: 'test-results',
});
