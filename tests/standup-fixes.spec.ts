import { test, expect } from "@playwright/test";
import { capture } from "./helpers";

/**
 * Verification for the technical items raised in the 27 Jul standup.
 * Runs under the artist project — see playwright.config.ts.
 */

/**
 * Saving a profile goes through a confirmation dialog (3 Aug standup), so
 * clicking "Save changes" is only half of it. These specs predate that and
 * were silently red until 11 Aug — see the note in the 10 Aug tracker.
 */
async function saveProfile(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const confirm = page.getByRole("button", { name: /Yes, save changes/i });
  if (await confirm.count()) await confirm.click();
}

test("S-URL-01 a website typed without https:// saves", async ({ page }) => {
  await page.goto("/dashboard/profile");

  // Exactly what was reported: type it the way people write a web address.
  await page.fill("#website_url", "midnightcollective.example.com");
  await saveProfile(page);

  await expect(page.getByText("Your changes have been saved.")).toBeVisible({
    timeout: 60_000,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, "S-URL-01", "Website saved without a scheme", {
    fullPage: true,
  });

  // The field shows it the way it was typed (10 Aug standup)…
  await page.goto("/dashboard/profile");
  await expect(page.locator("#website_url")).toHaveValue(
    "midnightcollective.example.com",
  );

  // …while what's *stored* is still the canonical URL, which is what makes the
  // public profile link work. That's the guarantee worth asserting.
  await page.goto("/dashboard");
  await page.getByTitle(/View .* public profile/).click();
  await page.waitForURL(/\/(artists|brands|organisers)\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole("link", { name: /Website/i }).first(),
  ).toHaveAttribute("href", "https://midnightcollective.example.com/");
});

test("S-URL-02 a genuinely invalid link is reported, not silently dropped", async ({
  page,
}) => {
  await page.goto("/dashboard/profile");
  await page.fill("#website_url", "not a website");
  await saveProfile(page);
  await expect(
    page.getByText(/Your website link doesn't look like a valid link/i),
  ).toBeVisible({ timeout: 60_000 });
  await capture(page, "S-URL-02", "Invalid website link reported inline");

  // Put it back so the suite is re-runnable.
  await page.goto("/dashboard/profile");
  await page.fill("#website_url", "midnightcollective.example.com");
  await saveProfile(page);
  await expect(page.getByText("Your changes have been saved.")).toBeVisible({
    timeout: 60_000,
  });
});

test("S-PUB-01 workspace icon links to the public profile", async ({ page }) => {
  await page.goto("/dashboard");

  const workspace = page.getByTitle(/View .* public profile/);
  await expect(workspace).toBeVisible();
  await capture(page, "S-PUB-01a", "Workspace card is now a link");

  await workspace.click();
  await page.waitForURL(/\/(artists|brands|organisers)\/[0-9a-f-]{36}/);
  // The public page must actually render, not 404 or bounce.
  await expect(
    page.getByText("The Midnight Collective").first(),
  ).toBeVisible();
  await capture(page, "S-PUB-01b", "Public profile reached from the icon", {
    fullPage: true,
  });
});

test("S-ART-01 an artist can create a sponsored event", async ({ page }) => {
  await page.goto("/dashboard/sponsored/new");
  // Previously requireRole(["brand"]) bounced the artist straight out.
  await expect(page).toHaveURL(/\/dashboard\/sponsored\/new/);
  await expect(
    page.getByRole("heading", { name: "Create a sponsored event" }),
  ).toBeVisible();

  // The brand is identified by the brief being proposed against.
  const campaign = page.locator("#campaign_id");
  await expect(campaign).toHaveAttribute("required", "");
  const briefs = await campaign
    .locator("option")
    .evaluateAll((els) =>
      els.map((e) => (e as HTMLOptionElement).value).filter(Boolean),
    );
  expect(briefs.length).toBeGreaterThan(0);

  await campaign.selectOption(briefs[0]);
  await page.fill("#name", "Midnight Collective × Brand — Autumn Session");
  await page.fill("#budget_gbp", "4000");
  await capture(page, "S-ART-01a", "Artist proposing a sponsorship", {
    fullPage: true,
  });

  await page.getByRole("button", { name: /Create sponsored event/i }).click();
  await page.waitForURL(/\/dashboard\/sponsored\/[0-9a-f-]{36}/, {
    timeout: 60_000,
  });

  // The artist has agreed by creating it; the brand has not yet.
  await expect(page.getByText("Artist agreed")).toBeVisible();
  await capture(page, "S-ART-01b", "Artist-initiated sponsorship created", {
    fullPage: true,
  });
});

test("S-TZ-02 time zone picker defaults to the UK", async ({ page }) => {
  await page.goto("/dashboard/events/new");
  const tz = page.locator("#timezone");
  await expect(tz).toHaveValue("Europe/London");
  await expect(tz.locator("option").first()).toHaveText("London (GMT/BST)");
  // Enough zones to be useful internationally, not a wall of 400.
  expect(await tz.locator("option").count()).toBeGreaterThan(10);
  await capture(page, "S-TZ-02", "Time zone picker defaults to London");
});

test("S-URL-03 link fields hint the format and flag mistakes inline", async ({
  page,
}) => {
  await page.goto("/dashboard/profile");

  await expect(
    page.getByText("No need to type https:// — we'll add it for you.").first(),
  ).toBeVisible();

  // Bad input: flagged on blur, before submitting anything.
  await page.fill("#website_url", "not a website");
  await page.locator("#website_url").blur();
  const inlineError = page.locator("#website_url-error");
  await expect(inlineError).toBeVisible();
  await expect(inlineError).toContainText(/doesn't look like a valid link/i);
  await expect(page.locator("#website_url")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  // Scroll to the message itself — centring the input leaves it just off-screen.
  await inlineError.scrollIntoViewIfNeeded();
  await capture(page, "S-URL-03a", "Inline warning on a malformed link");

  // Good input without a scheme: accepted, and left as the person wrote it.
  //
  // This used to assert the field rewrote itself to "https://…/" on blur. The
  // 10 Aug standup reversed that: a field whose own hint says "no need to type
  // https://" shouldn't fill itself with https:// the moment you look away.
  // The scheme is still added on the way into the database — see S-URL-01.
  await page.fill("#website_url", "midnightcollective.example.com");
  await page.locator("#website_url").blur();
  await expect(inlineError).toHaveCount(0);
  await expect(page.locator("#website_url")).toHaveValue(
    "midnightcollective.example.com",
  );
  await capture(page, "S-URL-03b", "A valid address is left as it was typed");
});

test("S-TZ-01 event start time and zone save and display", async ({ page }) => {
  await page.goto("/dashboard/events/new");

  await page.fill("#name", "Timezone Check — Summer Session");
  await page.fill("#event_date", "2026-08-13");
  await page.fill("#start_time", "19:30");
  await page.selectOption("#timezone", "Europe/London");
  await capture(page, "S-TZ-01a", "Event form with start time and time zone", {
    fullPage: true,
  });

  await page.getByRole("button", { name: "Create event" }).click();
  await page.waitForURL(/\/dashboard\/events(\?|$)/, { timeout: 60_000 });

  // August in London is BST — resolved from the date, not hard-coded.
  await expect(
    page.getByText(/13 Aug 2026, 19:30 BST/).first(),
  ).toBeVisible({ timeout: 30_000 });
  await capture(page, "S-TZ-01b", "Event listed with BST time zone", {
    fullPage: true,
  });
});

test("S-INT-01 register interest persists and confirms", async ({ page }) => {
  await page.goto("/dashboard/discover-campaigns");

  // FilterBar is also a .card, so narrow to the campaign cards, which are the
  // only ones carrying a reference.
  const card = page.locator(".card").filter({ hasText: "Ref " }).first();
  const button = card.getByRole("button", { name: "Register interest" });
  const alreadySent = card.getByText("✓ Interest sent");

  // Idempotent either way: register on a fresh database, otherwise assert the
  // standing confirmation is already showing from a previous run.
  if (await button.count()) {
    await button.click();
    await page.waitForURL(/registered=/);
    // Both the page banner and the card confirmation match, hence .first().
    await expect(
      page.getByText(/Interest sent|already registered interest/).first(),
    ).toBeVisible();
  }

  // The point of the fix: the confirmation survives a fresh page load.
  await page.goto("/dashboard/discover-campaigns");
  await expect(alreadySent).toBeVisible();
  await expect(
    card.getByRole("button", { name: "Register interest" }),
  ).toHaveCount(0);
  await capture(page, "S-INT-01", "Register interest — standing confirmation", {
    fullPage: true,
  });

  // A second attempt must not create a duplicate or re-notify.
  await page.goto("/dashboard/discover-campaigns");
  await expect(alreadySent).toBeVisible();
});
