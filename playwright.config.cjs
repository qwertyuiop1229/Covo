const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './browser-tests',
  workers: 1,
  use: { browserName: 'chromium', channel: 'chrome', headless: true, viewport: { width: 1180, height: 850 } },
  reporter: 'list',
  outputDir: 'scratch/browser-results',
});
