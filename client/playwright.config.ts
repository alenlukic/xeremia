import { defineConfig } from '@playwright/test';

const clientPort = Number(process.env.CLIENT_PORT) || 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${clientPort}`,
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `bash -c 'source ../override_env.sh 2>/dev/null; npx vite'`,
    port: clientPort,
    reuseExistingServer: true,
    timeout: 15_000,
  },
});
