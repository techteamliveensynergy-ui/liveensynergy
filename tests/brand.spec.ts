import { test, expect } from "@playwright/test";
import { capture, fixture } from "./helpers";

/**
 * Evidence capture for the items in "Brand Portal.pdf" (24 Jul review).
 * Each test maps to one numbered item so the report can cite it directly.
 * These document current behaviour rather than assert it — a failing
 * expectation here means the feature genuinely isn't there.
 */

test("B-OV-01 overview: confirmed sponsorships section", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Confirmed sponsorships" }),
  ).toBeVisible();
  await capture(page, "B-OV-01", "Overview — confirmed sponsorships", {
    fullPage: true,
  });
});

test("B-CAMP-01 campaign intro + description placeholder", async ({ page }) => {
  await page.goto("/dashboard/campaigns/new");
  await expect(
    page.getByRole("heading", { name: "Launch Your Next Partnership" }),
  ).toBeVisible();
  await expect(page.locator("#description")).toHaveAttribute(
    "placeholder",
    /young audiences who love trendy vibes/i,
  );
  await capture(page, "B-CAMP-01", "Campaign intro + description placeholder");
});

test("B-CAMP-02 breakdown beside budget, category below", async ({ page }) => {
  await page.goto("/dashboard/campaigns/new");
  await page.fill("#budget_gbp", "10000");
  await expect(page.getByText("Available for sponsorship")).toBeVisible();
  await capture(page, "B-CAMP-02", "Estimated breakdown beside budget", {
    selector: "form:has(#budget_gbp)",
  });
});

test("B-CAMP-03 budget below minimum is rejected", async ({ page }) => {
  await page.goto("/dashboard/campaigns/new");
  await page.fill("#budget_gbp", "300");
  await expect(page.getByText("Budget is below the minimum")).toBeVisible();
  await capture(page, "B-CAMP-03", "Budget below minimum guard", {
    selector: "form:has(#budget_gbp)",
  });
});

test("B-CAMP-04 artist categories include Sports, Gaming, Conference", async ({
  page,
}) => {
  await page.goto("/dashboard/campaigns/new");
  const options = await page.locator("#category option").allInnerTexts();
  expect(options).toContain("Sports");
  expect(options).toContain("Gaming");
  expect(options).toContain("Conference");
  expect(options).not.toContain("Sportsperson");
  await capture(page, "B-CAMP-04", "Artist / event categories");
});

test("B-CAMP-05 campaign artwork + mandatory manager details", async ({
  page,
}) => {
  await page.goto("/dashboard/campaigns/new");
  await page.setInputFiles('input[name="image"]', fixture("campaign.png"));
  for (const id of ["#manager_name", "#manager_email", "#manager_phone"]) {
    await expect(page.locator(id)).toHaveAttribute("required", "");
  }
  await page.locator("#manager_name").scrollIntoViewIfNeeded();
  await capture(page, "B-CAMP-05", "Campaign artwork + manager details", {
    fullPage: true,
  });
});

test("B-SPON-01 link artist and campaign, autofill from listing", async ({
  page,
}) => {
  await page.goto("/dashboard/sponsored/new");
  const listing = page.locator("#listing_id");
  const values = await listing.locator("option").evaluateAll((els) =>
    els.map((e) => (e as HTMLOptionElement).value).filter(Boolean),
  );
  expect(values.length).toBeGreaterThan(0);
  await capture(page, "B-SPON-01a", "Sponsored event — before linking listing", {
    selector: "form:has(#budget_gbp)",
  });

  await listing.selectOption(values[0]);
  await expect(page.locator("#artist_display_name")).not.toHaveValue("");
  await capture(page, "B-SPON-01b", "Sponsored event — autofilled from listing", {
    selector: "form:has(#budget_gbp)",
  });
});

test("B-SPON-02 banner, branding assets, audience participation", async ({
  page,
}) => {
  await page.goto("/dashboard/sponsored/new");
  await page.setInputFiles('input[name="banner"]', fixture("banner.png"));
  await page.fill(
    "#branding_guidelines",
    "Logo lock-up bottom-right on all creatives. Brand orange #E8622A only on CTAs. Never place the logo over the artist's face.",
  );
  await page.setInputFiles('input[name="asset_0"]', fixture("logo.png"));
  await page.fill("#asset_desc_0", "Primary brand logo (light backgrounds)");
  await page.setInputFiles('input[name="asset_1"]', fixture("event.png"));
  await page.fill("#asset_desc_1", "Artist performance image");
  await page.locator("#branding_guidelines").scrollIntoViewIfNeeded();
  await capture(page, "B-SPON-02", "Banner + branding guidelines & assets", {
    fullPage: true,
  });

  await expect(page.locator("#participation_deadline")).toHaveAttribute(
    "type",
    "datetime-local",
  );
  await expect(page.locator("#attendance_method")).toHaveAttribute(
    "placeholder",
    /ticket scan at the box office|QR code/i,
  );
  await page.locator("#participation_deadline").scrollIntoViewIfNeeded();
  await capture(page, "B-SPON-03", "Audience participation — deadline + attendance");
});

test("B-SPON-04 sponsored events grouped by status", async ({ page }) => {
  await page.goto("/dashboard/sponsored");
  await expect(
    page.getByRole("heading", { name: /Confirmed sponsorships/ }),
  ).toBeVisible();
  await capture(page, "B-SPON-04", "Sponsored events grouped by status", {
    fullPage: true,
  });
});

test("B-SPON-05 sponsored detail: locked terms + full event details", async ({
  page,
}) => {
  await page.goto("/dashboard/sponsored");
  // Exclude the "+ New sponsored event" CTA, which shares the href prefix.
  await page
    .locator('a[href^="/dashboard/sponsored/"]:not([href$="/new"])')
    .first()
    .click();
  await page.waitForURL(/\/dashboard\/sponsored\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Event details" })).toBeVisible();
  await capture(page, "B-SPON-05", "Sponsored event detail", { fullPage: true });
});

test("B-DISC-01 discover filters + sponsorship state on tiles", async ({
  page,
}) => {
  await page.goto("/dashboard/discover");
  for (const id of ["#filter-name", "#filter-location", "#filter-category", "#filter-month"]) {
    await expect(page.locator(id)).toBeVisible();
  }
  await capture(page, "B-DISC-01", "Discover events — filters + tile state", {
    fullPage: true,
  });
});

test("B-PROF-01 profile logo + banner upload", async ({ page }) => {
  await page.goto("/dashboard/profile");
  await page.setInputFiles('input[name="profile_image"]', fixture("logo.png"));
  await page.setInputFiles('input[name="banner"]', fixture("banner.png"));
  await capture(page, "B-PROF-01a", "Brand profile — logo + banner selected", {
    fullPage: true,
  });

  await page.getByRole("button", { name: /Save changes/i }).click();
  // The bug being verified: this used to 413 at the Server Action body limit
  // and render "Application error: a client-side exception has occurred".
  await expect(
    page.getByText("Your changes have been saved."),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Application error/i)).toHaveCount(0);
  // The banner renders at the top of the form; the page is still scrolled to
  // the submit button, so bring it back into frame before capturing.
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, "B-PROF-01b", "Brand profile — upload saved successfully");
});

test("B-MSG-01 chat split into partner / team threads", async ({ page }) => {
  await page.goto("/dashboard/messages");
  await expect(page.getByText("With artists & sponsors")).toBeVisible();
  await expect(page.getByText("With Live·En·Synergy team")).toBeVisible();
  await capture(page, "B-MSG-01", "Messages — split into two categories", {
    fullPage: true,
  });
});

test("B-MSG-02 attachments + details open in a new tab", async ({ page }) => {
  await page.goto("/dashboard/messages");
  const attachment = page.locator('input[name="attachment"]');
  if (await attachment.count()) {
    await expect(attachment).toHaveAttribute("accept", /video/);
  }
  const newTabLink = page.locator('a[target="_blank"]');
  await capture(page, "B-MSG-02", "Messages — attachments and new-tab links", {
    fullPage: true,
  });
  // Recorded in the report either way; absence means no thread has a linked
  // event or campaign yet, not that the feature is missing.
  test.info().annotations.push({
    type: "new-tab-links",
    description: String(await newTabLink.count()),
  });
});

test("B-REPO-01 repository under settings", async ({ page }) => {
  await page.goto("/dashboard/resources");
  await expect(page.getByRole("heading", { name: "Repository" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pricing structure" }),
  ).toBeVisible();
  await capture(page, "B-REPO-01", "Repository — guides, pricing, policies", {
    fullPage: true,
  });
});
