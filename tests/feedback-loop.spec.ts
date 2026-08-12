import { test, expect } from "@playwright/test";
import { fixture, shot } from "./helpers";

/**
 * The feedback loop, end to end: a user reports something from the widget, and
 * it turns up in the admin inbox with who reported it and the screenshot they
 * attached.
 *
 * Written 12 Aug 2026 after the inbox was found to be permanently empty — the
 * `profiles` embed was ambiguous (PGRST201), so the query errored, `data` came
 * back null, and the page rendered "Nothing reported" over a table full of
 * them. Runs under the admin project so one spec can watch both ends.
 */

const SUBJECT = "Feedback loop check — with screenshot";

test("F1 a report submitted from the widget reaches the admin inbox", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: /Feedback/i }).click();

  await page.selectOption("#widget-kind", "bug");
  await page.fill("#widget-subject", SUBJECT);
  await page.fill(
    "#widget-body",
    "Submitted by the end-to-end feedback spec, with an image attached.",
  );
  await page.setInputFiles('input[name="screenshot"]', fixture("logo.png"));
  await shot(page, "F1a-widget", "The feedback widget, filled in");

  const started = Date.now();
  await page.getByRole("button", { name: /Send to the team/i }).click();

  // The reporter is told what it was logged as — not left on "Sending…".
  const panel = page.locator('[aria-label="Report feedback"]');
  await expect(panel.getByText(/logged as FB-/i)).toBeVisible({
    timeout: 60_000,
  });
  const reference = (await panel.textContent())?.match(/FB-\d+/)?.[0];
  expect(reference).toBeTruthy();
  console.log(`confirmed as ${reference} in ${Date.now() - started}ms`);
  await shot(page, "F1b-confirmed", "Confirmation, quoting the reference");

  // The admin inbox lists it, names the reporter, shows their email, and
  // renders the screenshot rather than hiding it behind a link.
  await page.goto("/dashboard/admin/feedback");
  const card = page.locator(".card", { hasText: reference! }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText(SUBJECT)).toBeVisible();
  await expect(card.getByText("admin.tester@example.com")).toBeVisible();

  const thumb = card.locator(`img[alt*="${reference}"]`);
  await expect(thumb).toBeVisible();
  // A rendered image, not a broken one.
  expect(
    await thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);

  const link = card.getByRole("link", { name: /Open full size/i });
  await expect(link).toHaveAttribute("target", "_blank");

  await card.scrollIntoViewIfNeeded();
  await shot(page, "F1c-admin-inbox", "The report in the admin inbox", {
    selector: ".card:has-text('" + reference + "')",
  });
});

test("F2 the reporter sees their own report and screenshot", async ({
  page,
}) => {
  await page.goto("/dashboard/feedback");
  const card = page.locator(".card", { hasText: SUBJECT }).first();
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("link", { name: /Your screenshot/i }),
  ).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shot(page, "F2-own-reports", "The reporter's own list, with the image", {
    selector: "section:has-text('Your reports')",
  });
});

test("F3 the inbox says so when the query fails, rather than looking empty", async ({
  page,
}) => {
  // Guards the shape of the fix: an error must not render as "Nothing
  // reported". With the query working, neither the error card nor the empty
  // state should be on screen while reports exist.
  await page.goto("/dashboard/admin/feedback");
  await expect(page.getByText(/Couldn't load the feedback inbox/i)).toHaveCount(
    0,
  );
  await expect(page.getByText(/Nothing reported/i)).toHaveCount(0);

  // Everything reported since the widget shipped should be here — including
  // the client's own 7–8 Aug reports, which were invisible until 12 Aug.
  const cards = page.locator('.card:has-text("FB-")');
  console.log(`reports visible in the inbox: ${await cards.count()}`);
  await shot(page, "F3-inbox-full", "The whole inbox, no longer empty", {
    fullPage: true,
  });
});
