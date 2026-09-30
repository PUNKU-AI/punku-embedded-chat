import { defineConfig, devices } from '@playwright/test';

// Linux WebKit uses Xvfb. Chromium and Firefox keep their headless compositor.
const webkitHeadless = !process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 20000,
  expect: { timeout: 5000 },
  outputDir: 'output/playwright/results',
  reporter: [['line'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 5000,
  },
  webServer: {
    command: 'node e2e/server.cjs',
    url: 'http://127.0.0.1:4179/health',
    reuseExistingServer: false,
    timeout: 10000,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], headless: webkitHeadless } },
    { name: 'android', use: { ...devices['Pixel 7'], channel: 'chromium' } },
    { name: 'iphone', use: { ...devices['iPhone 13'], headless: webkitHeadless } },
    { name: 'narrow-phone', use: { ...devices['Pixel 7'], channel: 'chromium', viewport: { width: 320, height: 568 } } },
    { name: 'phone-landscape', use: { ...devices['iPhone 13 landscape'], headless: webkitHeadless } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], headless: webkitHeadless } },
  ],
});
