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

test("F4 an admin opens a chat with the reporter in a new tab", async ({
  page,
}) => {
  await page.goto("/dashboard/admin/feedback");

  const link = page.getByRole("link", { name: /^Message .+ ↗$/ }).first();
  await expect(link).toBeVisible();
  // A link, not a server-action form — a form submits over fetch, so
  // target="_blank" on it is ignored and the thread steals the current tab.
  await expect(link).toHaveAttribute("target", "_blank");
  await shot(page, "F4a-message-button", "Message the reporter, from the inbox", {
    selector: ".card:has-text('FB-')",
  });

  const first = await Promise.all([page.waitForEvent("popup"), link.click()]).then(
    ([p]) => p,
  );
  await first.waitForURL(/\/dashboard\/messages\?c=/, { timeout: 30_000 });
  const conversationId = new URL(first.url()).searchParams.get("c");
  expect(conversationId).toBeTruthy();
  await expect(first.locator("section.card")).toBeVisible();
  await shot(first, "F4b-thread", "A thread with the reporter, in its own tab");

  // The report itself is still open behind it.
  await expect(page).toHaveURL(/\/dashboard\/admin\/feedback/);
  await first.close();

  // Clicking again reuses that thread rather than starting a second one.
  const second = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: /^Message .+ ↗$/ }).first().click(),
  ]).then(([p]) => p);
  await second.waitForURL(/\/dashboard\/messages\?c=/, { timeout: 30_000 });
  expect(new URL(second.url()).searchParams.get("c")).toBe(conversationId);
  await second.close();
});

/**
 * Reporting is for signed-in accounts only. Enforced four times over — the
 * widget only mounts inside the dashboard and onboarding shells, middleware
 * bounces anonymous requests off those prefixes, `submitFeedback` redirects
 * without a user, and the `feedback_reports: own insert` policy checks
 * `profile_id = auth.uid()`, which no anonymous caller can satisfy.
 *
 * Uses a fresh context with no storage state, because the project this runs
 * under is signed in as the admin.
 */
test("F5 a signed-out visitor cannot see or reach the report form", async ({
  browser,
  baseURL,
}) => {
  const anon = await browser.newContext({ storageState: undefined });
  const page = await anon.newPage();

  try {
    // No widget anywhere on the public site.
    for (const path of ["/", "/about", "/events", "/contact", "/faqs"]) {
      await page.goto(`${baseURL}${path}`);
      await expect(
        page.getByRole("button", { name: /Feedback/i }),
      ).toHaveCount(0);
    }
    await shot(page, "F5a-public", "No feedback tab when signed out");

    // And the form's own route bounces to sign-in, keeping the destination.
    await page.goto(`${baseURL}/dashboard/feedback`);
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    expect(new URL(page.url()).searchParams.get("redirectTo")).toBe(
      "/dashboard/feedback",
    );
    await shot(page, "F5b-redirected", "The report form redirects to sign-in");
  } finally {
    await anon.close();
  }
});

test("F6 chat messages carry a time, grouped under a day heading", async ({
  page,
}) => {
  await page.goto("/dashboard/messages");
  const thread = page.locator('a[href^="/dashboard/messages?c="]').first();
  test.skip((await thread.count()) === 0, "no threads to look at");
  await thread.click();
  await page.waitForURL(/\?c=/);

  const panel = page.locator("section.card");
  // One heading per day, at the top of that day's run — Today / Yesterday /
  // the date — with a clock time on each message under it.
  await expect(
    panel.getByText(/^(Today|Yesterday|\d{1,2} \w{3}|\w+day)$/).first(),
  ).toBeVisible();
  await expect(panel.getByText(/^\d{2}:\d{2}$/).first()).toBeVisible();

  await shot(page, "F6-chat-timestamps", "Day headings and message times", {
    selector: "section.card",
  });
});
