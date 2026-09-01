import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal end-to-end coverage for the business flows the UI owns.
 *
 * Runs against a production server on its own port and its own database, so it
 * never collides with `npm run dev` or touches development data.
 */
const PORT = 3100;
const DATABASE = "receipt_issuer_e2e";
const MONGODB_URI = process.env.TEST_MONGODB_URI ?? "mongodb://127.0.0.1:27018";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  // The flows build on each other's data, so they run one at a time.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: process.env.CI ? "line" : [["list"]],
  retries: 0,
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    env: { MONGODB_DB: DATABASE, MONGODB_URI, NODE_ENV: "production" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `http://127.0.0.1:${PORT}/login`,
  },
  workers: 1,
});

export { DATABASE, MONGODB_URI, PORT };
