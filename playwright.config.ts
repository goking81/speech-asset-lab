import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
    },
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm test:e2e:setup && pnpm exec next dev --hostname 127.0.0.1',
    env: {
      DATABASE_URL: 'file:../data/e2e-test/speech-asset-lab.db',
      APP_DATA_DIR: './data/e2e-test',
      APP_FILES_DIR: './data/e2e-test/files',
      APP_LOGS_DIR: './data/e2e-test/logs',
      APP_BACKUPS_DIR: './data/e2e-test/backups',
      AI_PROVIDER: '',
      AI_MODEL: '',
      AI_API_KEY: '',
    },
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
  },
});
