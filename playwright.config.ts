import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: process.env.PLAYWRIGHT_FULL ? [] : ["**/analysis.spec.ts"],
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec vite dev --port ${port} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_FULL,
        timeout: 120_000,
        env: {
          ...process.env,
          APP_URL: baseURL,
          AUTH_SIGNUP_MODE: process.env.AUTH_SIGNUP_MODE ?? "open",
          SESSION_SECRET: process.env.SESSION_SECRET ?? "playwright-session-secret-not-for-prod",
          ...(process.env.PLAYWRIGHT_FULL
            ? {
                STORAGE_DRIVER: "fs",
                STORAGE_ENDPOINT: "",
                STORAGE_LOCAL_PATH: path.join(process.cwd(), "storage"),
              }
            : {}),
        },
      },
});
