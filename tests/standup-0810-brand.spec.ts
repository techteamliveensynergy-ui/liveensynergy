import { test, expect } from "@playwright/test";
import { shot } from "./helpers";

/** 10 Aug standup batch — brand seat. */

test("B1 selection is no longer the brand's to make", async ({ page }) => {
  await page.goto("/dashboard/sponsored");
  const link = page.locator('a[href^="/dashboard/sponsored/"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/dashboard\/sponsored\/[0-9a-f-]{36}/);

  const panel = page.locator(".card:has-text('Participants')");
  await panel.scrollIntoViewIfNeeded();

  // The two controls the standup asked to be removed.
  await expect(panel.getByRole("button", { name: /^Select$/ })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^Reject$/ })).toHaveCount(0);

  // …and the copy that explains why.
  await expect(
    panel.getByText(/drawn at random by the\s+Live·En·Synergy team/i),
  ).toBeVisible();
  await shot(page, "B1-participants", "No Select/Reject on the brand's panel", {
    selector: ".card:has-text('Participants')",
  });
});

test("B2 the enquiry link carries the sponsorship reference", async ({
  page,
}) => {
  await page.goto("/dashboard/sponsored");
  await page.locator('a[href^="/dashboard/sponsored/"]').first().click();
  await page.waitForURL(/\/dashboard\/sponsored\/[0-9a-f-]{36}/);

  const link = page.getByRole("link", { name: /Raise an enquiry/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("target", "_blank");
  expect(await link.getAttribute("href")).toMatch(/\/contact\?ref=SPE-/);
  await link.scrollIntoViewIfNeeded();
  await shot(page, "B2-enquiry-link", "Raise an enquiry from a sponsorship");
});

test("B3 a brand can suggest an external event on a campaign", async ({
  page,
}) => {
  await page.goto("/dashboard/campaigns");
  const edit = page.getByRole("link", { name: /^Edit$/ }).first();
  await expect(edit).toBeVisible();
  await edit.click();
  await page.waitForURL(/\/dashboard\/campaigns\/[0-9a-f-]{36}/);

  const note = page.locator("#suggested_event_note");
  await note.scrollIntoViewIfNeeded();
  await expect(note).toBeVisible();
  await shot(page, "B3a-form", "The 'Know an event already?' section", {
    selector: "section:has(#suggested_event_note)",
  });

  // A link that isn't one is reported rather than silently dropped.
  await note.fill("Late-Shift Sessions at Peckham Audio, 14 March.");
  await page.fill("#suggested_event_url", "not a link");
  await page.getByRole("button", { name: /Save changes/i }).click();
  await expect(
    page.getByText(/suggested event link doesn't look like a valid link/i),
  ).toBeVisible({ timeout: 30_000 });
  await shot(page, "B3b-invalid", "An invalid suggestion link is reported");

  // A scheme-less one is accepted and canonicalised.
  await page.goto("/dashboard/campaigns");
  await page.getByRole("link", { name: /^Edit$/ }).first().click();
  await page.waitForURL(/\/dashboard\/campaigns\/[0-9a-f-]{36}/);
  await page.locator("#suggested_event_note").fill(
    "Late-Shift Sessions at Peckham Audio, 14 March — merch stand + a story mention.",
  );
  await page.fill("#suggested_event_url", "eventbrite.co.uk/e/late-shift");
  await page.getByRole("button", { name: /Save changes/i }).click();
  await page.waitForURL(/\/dashboard\/campaigns$/, { timeout: 30_000 });

  await expect(page.getByText(/Your suggested event/i).first()).toBeVisible();
  await shot(page, "B3c-on-card", "The suggestion on the brand's campaign card", {
    fullPage: true,
  });
});

test("B4 link fields don't fill themselves with https://", async ({ page }) => {
  await page.goto("/dashboard/profile");

  const website = page.locator("#website_url");
  await website.scrollIntoViewIfNeeded();
  await website.fill("northwavecoffee.example.com");
  // Blur — this is the moment it used to rewrite itself to https://…/
  await page.locator("#social_instagram").click();
  await expect(website).toHaveValue("northwavecoffee.example.com");

  // Placeholders don't advertise a scheme either.
  await expect(page.locator("#social_instagram")).toHaveAttribute(
    "placeholder",
    /^instagram\.com/,
  );
  await shot(page, "B4a-no-scheme", "Link fields keep the address as typed", {
    selector: "section:has(#social_instagram)",
  });

  // A pasted full URL is tidied down, not up.
  await website.fill("HTTPS://Northwave.example.com/shop?x=1");
  await page.locator("#social_instagram").click();
  await expect(website).toHaveValue("northwave.example.com/shop?x=1");
  await shot(page, "B4b-tidied", "A pasted URL is tidied to its display form", {
    selector: "section:has(#website_url)",
  });
});

test("D1 contacting an organiser twice opens the same thread", async ({
  page,
}) => {
  await page.goto("/dashboard/discover");
  const contact = page.getByRole("button", { name: /Contact organiser/i }).first();
  test.skip((await contact.count()) === 0, "no available listings to enquire on");

  await contact.click();
  await page.waitForURL(/\/dashboard\/messages/, { timeout: 30_000 });
  const first = new URL(page.url()).searchParams.get("c");
  expect(first).toBeTruthy();
  await shot(page, "D1a-first", "First enquiry opens a thread");

  // Second time: used to 400 on the lookup, fail the insert on the unique
  // index, and bounce back to Discover with no message at all.
  await page.goto("/dashboard/discover");
  await page.getByRole("button", { name: /Contact organiser/i }).first().click();
  await page.waitForURL(/\/dashboard\/messages/, { timeout: 30_000 });
  const second = new URL(page.url()).searchParams.get("c");
  expect(second).toBe(first);
  await shot(page, "D1b-same-thread", "Second time reopens the same thread");
});
