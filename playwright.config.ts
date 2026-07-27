import { defineConfig, devices } from "@playwright/test";

/**
 * Drives the QA accounts in `docs/qa-creds.md` against a local dev server, so
 * it only ever touches the dev Supabase project — never production.
 *
 * The `client-review` suite captures evidence for the Artist/Brand portal
 * review rather than asserting behaviour, so it runs single-worker and in file
 * order: several captures build on state the previous one set up.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "brand",
      testMatch: /brand\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/brand.json" },
    },
    {
      name: "artist",
      testMatch: /(artist|standup-fixes)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/artist.json" },
    },
  ],
});
