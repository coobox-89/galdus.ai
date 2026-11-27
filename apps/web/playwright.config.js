import { defineConfig } from '@playwright/test';

// End-to-end tests run the real API (needs DATABASE_URL), the built console and a fake model server.
// Build first with VITE_API_BASE_URL=http://127.0.0.1:8000/api.
// A fresh platform-admin address per run (workers inherit it from the main process), passed to the API.
process.env.E2E_ADMIN_EMAIL ||= `e2e-admin-${Date.now()}@example.com`;
process.env.ADMIN_EMAILS ||= process.env.E2E_ADMIN_EMAIL;
const api = process.env.E2E_API_CMD || 'cd ../api && uvicorn app.main:app --host 127.0.0.1 --port 8000';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME, args: ['--no-sandbox'] } : {},
  },
  webServer: [
    { command: 'node e2e/fake-llm.mjs', port: 9002, reuseExistingServer: !process.env.CI },
    { command: api, url: 'http://127.0.0.1:8000/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', port: 4173, reuseExistingServer: !process.env.CI },
  ],
});
