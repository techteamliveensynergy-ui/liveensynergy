import { test, expect } from "@playwright/test";
import { shot } from "./helpers";

/** 10 Aug standup batch — audience seat. */

test("U1 a selected participant can no longer withdraw", async ({ page }) => {
  await page.goto("/dashboard/participations");

  const cards = page.locator(".card", { hasText: /Registered|Selected|Ticket/ });
  test.skip((await cards.count()) === 0, "no participations on this account");

  // The admin draw (A4) ran before this spec, so at least one should be
  // selected. Find the card that says so.
  const selected = page
    .locator(".card")
    .filter({ hasText: /You're selected — contact the team/i })
    .first();

  if (await selected.count()) {
    await selected.scrollIntoViewIfNeeded();
    await expect(
      selected.getByRole("button", { name: /^Withdraw$/ }),
    ).toHaveCount(0);
    await shot(page, "U1a-selected", "Selected: no Withdraw, an explanation instead", {
      selector: ".card:has-text('contact the team')",
    });
  } else {
    await shot(page, "U1a-none-selected", "No selected participation to check");
  }

  // An unselected one still offers it.
  const withdrawable = page.getByRole("button", { name: /^Withdraw$/ }).first();
  if (await withdrawable.count()) {
    await withdrawable.scrollIntoViewIfNeeded();
    await shot(page, "U1b-unselected", "Unselected: Withdraw is still offered");
  }

  await shot(page, "U1c-my-events", "My events, after the draw", { fullPage: true });
});

test("U2 the audience overview still renders after the batch", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page.locator("aside, nav").first()).toBeVisible();
  await shot(page, "U2-overview", "Audience overview", { fullPage: true });
});
