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
    // The 10 Aug batch is split by the seat each item has to be checked from —
    // a random draw only exists for an admin, a withdrawal rule only for an
    // audience member. Ordered admin → brand → artist → audience because the
    // draw and the campaign relay set up state the later ones read.
    {
      name: "s0810-admin",
      testMatch: /(standup-0810-admin|feedback-loop)\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/admin.json" },
    },
    {
      name: "s0810-brand",
      testMatch: /standup-0810-brand\.spec\.ts/,
      dependencies: ["s0810-admin"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/brand.json" },
    },
    {
      name: "s0810-artist",
      testMatch: /standup-0810-artist\.spec\.ts/,
      dependencies: ["s0810-brand"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/artist.json" },
    },
    {
      name: "s0810-audience",
      testMatch: /standup-0810-audience\.spec\.ts/,
      dependencies: ["s0810-artist"],
      use: { ...devices["Desktop Chrome"], storageState: "tests/.auth/audience.json" },
    },
    {
      // Walkthrough recording of everything the 3 Aug standup changed, across
      // all four roles. One context start to finish so it comes out as a
      // single continuous video — signing in and out happens on camera.
      //
      // Read-only by design: it opens dialogs and cancels them, types into the
      // budget field to show the live recalculation and doesn't save. Re-runs
      // don't change any data.
      name: "standup-video",
      testMatch: /standup-walkthrough\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // Records against the deployed site by default rather than a local dev
        // server: no per-route compilation to stall a recording, and it's the
        // build the client actually looks at. Override with WALKTHROUGH_URL to
        // point it at localhost.
        baseURL:
          process.env.WALKTHROUGH_URL ?? "https://liveensynergy-rho.vercel.app",
        video: { mode: "on", size: { width: 1280, height: 800 } },
        viewport: { width: 1280, height: 800 },
        actionTimeout: 45_000,
        navigationTimeout: 90_000,
        launchOptions: { slowMo: 250 },
      },
    },
    {
      // Walkthrough recording of the audience journey. Deliberately signed out
      // — the whole point is to start from account creation — so no
      // storageState, and no dependency on the setup project.
      name: "audience-video",
      testMatch: /audience-journey\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        video: { mode: "on", size: { width: 1280, height: 800 } },
        viewport: { width: 1280, height: 800 },
        // Slower than a test needs to be, because a person has to watch it.
        launchOptions: { slowMo: 350 },
      },
    },
  ],
});
