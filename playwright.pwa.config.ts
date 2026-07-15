import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-pwa',
  timeout: 30_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    reuseExistingServer: false,
    timeout: 30_000,
    url: 'http://127.0.0.1:4173',
  },
})
