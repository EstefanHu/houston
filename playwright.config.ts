import { defineConfig, devices } from '@playwright/test';

const PORT = 5180; // separate from `npm run dev` (5173), so both can run at once

export default defineConfig({
  testDir: 'e2e',
  // Fail CI if someone leaves a `test.only` in, and retry once there to absorb flakes.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // 'list' prints each test as it runs; 'html' writes a browsable report to playwright-report/.
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: `http://localhost:${PORT}`,
    // On a failed retry, keep a trace you can replay step by step: npx playwright show-trace <file>
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      // Software WebGL, so the 3D view renders the same on a laptop and a CI machine with no GPU.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Playwright starts the Vite dev server before the tests and stops it afterwards.
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
