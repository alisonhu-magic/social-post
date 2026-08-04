// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/* The tool is a single self-contained HTML file, so tests serve the repo root
   over http (file:// would block canvas readback and the fetch-free asserts). */
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'line' : [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:8099',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        // SwiftShader gives deterministic WebGL2 in headless CI.
        launchOptions: {
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: 'npx --yes http-server . -p 8099 -c-1 --silent',
    url: 'http://127.0.0.1:8099/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
