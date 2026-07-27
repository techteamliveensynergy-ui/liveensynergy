import { test, expect } from "@playwright/test";

/**
 * Walkthrough recording of the audience journey: a brand-new account signing
 * in for the first time, completing onboarding, discovering a sponsored event,
 * registering for it and submitting ticket proof.
 *
 * The account is seeded directly into auth.users beforehand, following the
 * recipe in docs/qa-creds.md, because the dev project has email confirmation
 * switched on and uses Supabase's built-in mailer — capped at a few messages an
 * hour — so the sign-up form can't be driven end to end reliably. Everything
 * from the first sign-in onwards is the real UI, with no pre-filled profile.
 *
 * To re-record, re-run that seeding SQL first (it deletes and recreates the
 * user, so onboarding_completed goes back to false).
 *
 * Recorded by the `audience-video` project in playwright.config.ts.
 */

const EMAIL = "audience.demo@qa-liveensynergy.co.uk";
const PASSWORD = "TestPass123!";
const FULL_NAME = "Jordan Avery";

/** Lets a viewer read the screen before the next action. */
async function beat(page: import("@playwright/test").Page, ms = 1200) {
  await page.waitForTimeout(ms);
}

test("audience journey — first sign-in, onboard, register, submit ticket", async ({
  page,
}) => {
  test.setTimeout(240_000);

  // ---- 1. Arrive on the public site -------------------------------------
  await page.goto("/");
  await beat(page, 1500);

  // ---- 2. First sign-in with the new account -----------------------------
  await page.goto("/auth/sign-in");
  await beat(page, 800);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await beat(page, 700);
  await page.click('button[type="submit"]');

  // A brand-new account has no profile yet, so the app routes to onboarding.
  await page.waitForURL(/\/onboarding/, { timeout: 60_000 });
  await beat(page, 1200);

  // ---- 3. Onboarding ------------------------------------------------------
  await expect(page).toHaveURL(/\/onboarding/);
  await beat(page);

  await page.fill("#full_name", FULL_NAME);
  await page.fill("#phone", "+44 7700 900123");
  await page.fill("#date_of_birth", "1998-04-22");
  await page.fill("#address", "42 Rye Lane, Peckham");
  await page.fill("#postcode", "SE15 5BS");
  await beat(page);
  await page.getByRole("button", { name: /Finish|Save/i }).first().click();

  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await beat(page, 1500);

  // ---- 4. Discover a sponsored event --------------------------------------
  await page.goto("/dashboard/discover");
  await beat(page, 1500);

  const registerButton = page
    .getByRole("button", { name: /Register to attend|Register/i })
    .first();

  if (await registerButton.count()) {
    await registerButton.click();
    await page.waitForLoadState("networkidle");
    await beat(page, 1500);
  }

  // ---- 5. My events → submit ticket proof ---------------------------------
  await page.goto("/dashboard/participations");
  await beat(page, 1500);

  const ticketField = page.locator('input[name="ticket_proof_url"]').first();
  if (await ticketField.count()) {
    await ticketField.fill("https://seetickets.example.com/order/AV-88213");
    await beat(page, 800);
    await page
      .getByRole("button", { name: /Submit|Save|Upload/i })
      .first()
      .click();
    await page.waitForLoadState("networkidle");
    await beat(page, 1500);
  }

  // ---- 6. Land back on the dashboard --------------------------------------
  await page.goto("/dashboard");
  await beat(page, 2500);
});
