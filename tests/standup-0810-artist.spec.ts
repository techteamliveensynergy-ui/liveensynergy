import { test, expect } from "@playwright/test";
import { shot } from "./helpers";

/** 10 Aug standup batch — artist / organiser seat. */

test("R1 the artist receives the admin's message under the team tab", async ({
  page,
}) => {
  await page.goto("/dashboard/messages?tab=support");
  await expect(
    page.getByText(/Checking in from the team/i).first(),
  ).toBeVisible({ timeout: 30_000 });

  // Captioned as the team, not as a named member of staff.
  await expect(
    page.getByText("Live·En·Synergy team").first(),
  ).toBeVisible();
  await shot(page, "R1-admin-message", "Admin-started thread, seen by the artist", {
    selector: "section.card",
  });
});

test("R2 the artist sees the sponsor's suggested event on the campaign", async ({
  page,
}) => {
  await page.goto("/dashboard/discover-campaigns");
  const suggestion = page.getByText(/They've suggested/i).first();
  test.skip(
    (await suggestion.count()) === 0,
    "the seeded campaign is already matched, so it isn't on the open browse",
  );
  await expect(suggestion).toBeVisible();
  await shot(page, "R2-suggestion", "Sponsor's suggestion on the artist's browse", {
    fullPage: true,
  });
});

test("R3 selection is not the artist's to make either", async ({ page }) => {
  await page.goto("/dashboard/sponsored");
  const link = page.locator('a[href^="/dashboard/sponsored/"]').first();
  test.skip((await link.count()) === 0, "no sponsorships on this account");

  await link.click();
  await page.waitForURL(/\/dashboard\/sponsored\/[0-9a-f-]{36}/);

  const panel = page.locator(".card:has-text('Participants')");
  test.skip((await panel.count()) === 0, "not a party to this event");
  await panel.scrollIntoViewIfNeeded();
  await expect(panel.getByRole("button", { name: /^Select$/ })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^Reject$/ })).toHaveCount(0);
  await shot(page, "R3-participants", "No Select/Reject on the artist's panel", {
    selector: ".card:has-text('Participants')",
  });
});

test("R4 a phone number shared with an audience account is accepted", async ({
  page,
}) => {
  // The 10 Aug change: one person, several roles. Priya Shah's audience
  // account holds +44 7700 900123; an artist saving the same number used to be
  // rejected outright.
  await page.goto("/dashboard/profile");
  const phone = page.locator("#contact_phone");
  await phone.scrollIntoViewIfNeeded();
  const original = await phone.inputValue();

  await phone.fill("+44 7700 900123");
  await page.getByRole("button", { name: /Save changes/i }).click();
  const confirm = page.getByRole("button", { name: /Yes, save changes/i });
  if (await confirm.count()) await confirm.click();

  await expect(page.getByText("Your changes have been saved.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByText(/already registered to another/i),
  ).toHaveCount(0);
  await shot(page, "R4-shared-number", "An artist may share a number with an audience account");

  // Put it back so the suite is re-runnable.
  await page.goto("/dashboard/profile");
  await page.locator("#contact_phone").fill(original || "+44 7700 900999");
  await page.getByRole("button", { name: /Save changes/i }).click();
  const confirm2 = page.getByRole("button", { name: /Yes, save changes/i });
  if (await confirm2.count()) await confirm2.click();
  await expect(page.getByText("Your changes have been saved.")).toBeVisible({
    timeout: 30_000,
  });
});
