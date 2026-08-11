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

test("R2 the sponsor's suggestion reaches the artist in the chat", async ({
  page,
}) => {
  // The brand spec (B3) saved a suggestion on an already-matched campaign.
  // `open_campaigns` excludes matched campaigns, so the browse card can never
  // carry it — the message has to arrive in the thread instead.
  await page.goto("/dashboard/messages");
  await expect(
    page.getByText(/event we'd like to sponsor/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Late-Shift Sessions at Peckham Audio/i).first())
    .toBeVisible();
  await shot(page, "R2-suggestion-chat", "The sponsor's suggestion, in the chat", {
    selector: "section.card",
  });
});

test("R2b an unmatched campaign carries the suggestion on the browse", async ({
  page,
}) => {
  await page.goto("/dashboard/discover-campaigns");
  const suggestion = page.getByText(/They've suggested/i).first();
  test.skip(
    (await suggestion.count()) === 0,
    "no unmatched campaign carries a suggestion in this dataset",
  );
  await expect(suggestion).toBeVisible();
  await shot(page, "R2b-suggestion-browse", "Suggestion on the artist's browse", {
    fullPage: true,
  });
});

test("R3 selection is not the artist's to make either", async ({ page }) => {
  await page.goto("/dashboard/sponsored");
  const links = page
    .locator('a[href^="/dashboard/sponsored/"]')
    .filter({ hasNotText: /New sponsored event/ });
  test.skip((await links.count()) === 0, "no sponsorships on this account");

  const hrefs = [
    ...new Set(
      await links.evaluateAll((els) =>
        els.map((e) => (e as HTMLAnchorElement).pathname),
      ),
    ),
  ];

  // An event with nobody registered would pass this trivially, so find one
  // that actually lists people.
  let ready = false;
  for (const href of hrefs) {
    await page.goto(href);
    const heading = await page
      .getByRole("heading", { name: /^Participants \(\d+\)$/ })
      .first()
      .textContent()
      .catch(() => null);
    if (heading && !heading.includes("(0)")) {
      ready = true;
      break;
    }
  }
  test.skip(!ready, "no sponsorship on this account has any registrations");

  const panel = page.locator(".card:has-text('Participants')");
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
