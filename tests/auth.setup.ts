import { test as setup, expect } from "@playwright/test";
import { ACCOUNTS } from "./helpers";

/**
 * Signs each QA account in once and banks the cookies, so the capture specs
 * don't spend a sign-in round trip per test.
 */
for (const [key, account] of Object.entries(ACCOUNTS)) {
  setup(`authenticate as ${key}`, async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.fill("#email", account.email);
    await page.fill("#password", account.password);
    await page.click('button[type="submit"]');

    // The dashboard shell redirects to /onboarding when a profile is
    // incomplete, so landing on /dashboard is the real signal sign-in worked.
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
    await expect(page.locator("aside, nav").first()).toBeVisible();

    await page.context().storageState({ path: `tests/.auth/${key}.json` });
  });
}
