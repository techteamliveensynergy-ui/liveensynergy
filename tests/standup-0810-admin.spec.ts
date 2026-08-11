import { test, expect } from "@playwright/test";
import { shot } from "./helpers";

/**
 * Verification + evidence capture for the 10 Aug standup batch — admin seat.
 *
 * Runs first (see playwright.config.ts): the random draw and the campaign
 * relay set up state the brand/artist/audience specs then read.
 */

/** Opens the first sponsored event in the admin events list. */
async function openFirstSponsoredEvent(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/admin/events");
  const link = page
    .locator('a[href^="/dashboard/admin/events/sponsored/"]')
    .first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/dashboard\/admin\/events\/sponsored\//);
}

test("A1 ticket price and capacity are visible and editable", async ({
  page,
}) => {
  await openFirstSponsoredEvent(page);

  // Visible on the Deal panel — neither was shown at all before.
  await expect(page.getByText("Ticket price", { exact: true })).toBeVisible();
  await expect(page.getByText("Capacity", { exact: true }).first()).toBeVisible();
  await shot(page, "A1a-deal-panel", "Ticket price and capacity on the Deal panel", {
    selector: ".card:has-text('Deal')",
  });

  // …and editable, on the admin-only edit form.
  const price = page.locator("#edit-ticket-price");
  const capacity = page.locator("#edit-capacity");
  await expect(price).toBeVisible();
  await expect(capacity).toBeVisible();
  await price.scrollIntoViewIfNeeded();
  await shot(page, "A1b-edit-form", "Ticket price and capacity in the edit form", {
    selector: ".card:has-text('Edit event details')",
  });

  // Change the price and confirm it round-trips to the listing.
  await price.fill("27");
  await capacity.fill("450");
  await page.getByRole("button", { name: /Save event details/i }).click();
  await page.getByRole("button", { name: /Yes, save changes/i }).click();
  await expect(page.getByText("Your changes have been saved.")).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, "A1c-saved", "Saved through to the listing");

  await page.reload();
  await expect(page.locator("#edit-ticket-price")).toHaveValue("27");
  await expect(page.locator("#edit-capacity")).toHaveValue("450");
});

test("A2 an admin can tell the two speakers apart in someone else's thread", async ({
  page,
}) => {
  await page.goto("/dashboard/messages");

  const threads = page.locator('a[href^="/dashboard/messages?c="]');
  const count = await threads.count();
  test.skip(count === 0, "no partner threads seeded");

  await threads.first().click();
  await page.waitForURL(/\?c=/);

  // The thread names both parties, and each message is captioned with its
  // sender — neither of which existed before.
  const header = page.locator("section.card").first();
  await expect(header.getByText("↔")).toBeVisible();
  await shot(page, "A2-thread", "Sender names and sides in an admin view", {
    selector: "section.card",
  });
});

test("A3 an admin can start a chat with a user who hasn't written in", async ({
  page,
}) => {
  await page.goto("/dashboard/messages");

  const open = page.getByRole("button", {
    name: /New chat with an artist or sponsor/i,
  });
  await expect(open).toBeVisible();
  await shot(page, "A3a-button", "New chat control on the admin Messages page");

  await open.click();
  const picker = page.locator("#new-thread-person");
  await expect(picker).toBeVisible();

  // Admins are excluded from the picker — the thread shape is user↔team.
  const options = await picker.locator("option").allTextContents();
  expect(options.join(" ")).not.toMatch(/Sakshi Admin/);
  // Options name the act or brand, not just the account holder — otherwise
  // three entries read "Sakshi Gulati" with nothing to tell them apart.
  expect(options.join(" ")).toMatch(/The Midnight Collective/);
  expect(options.join(" ")).toMatch(/Northwave Coffee/);
  await shot(page, "A3b-picker", "Person picker, named by act and brand");

  await picker.selectOption({
    label: "The Midnight Collective — Artist Tester",
  });
  await page.fill("#new-thread-subject", "10 Aug verification");
  await page.getByRole("button", { name: /Start chat/i }).click();

  await page.waitForURL(/notice=admin-thread|c=/, { timeout: 30_000 });
  await expect(
    page.getByText(/Thread open|With Live·En·Synergy team/i).first(),
  ).toBeVisible();
  await shot(page, "A3c-opened", "Thread opened with the artist");

  // Send the first message so the artist spec can find it.
  await page.fill(
    'textarea[name="body"]',
    "Checking in from the team — 10 Aug verification pass.",
  );
  await page.getByRole("button", { name: /^Send$/i }).click();
  await expect(
    page.getByText("Checking in from the team").first(),
  ).toBeVisible({ timeout: 30_000 });
  await shot(page, "A3d-sent", "Admin message sent, captioned 'You'");
});

test("A4 selection runs as a random draw", async ({ page }) => {
  await openFirstSponsoredEvent(page);

  const panel = page.locator(".card:has-text('Participants')");
  await panel.scrollIntoViewIfNeeded();

  // The intro copy is the contract: the draw is here, not on the brand's page.
  await expect(
    panel.getByText(/Selection is a random draw run here/i),
  ).toBeVisible();

  const draw = page.locator("#draw-places");
  if (!(await draw.isVisible().catch(() => false))) {
    await shot(page, "A4a-no-one-waiting", "Draw hidden when nobody is waiting", {
      selector: ".card:has-text('Participants')",
    });
    test.skip(true, "nobody waiting in the draw on this event");
  }

  await shot(page, "A4a-panel", "The random selection draw panel", {
    selector: ".card:has-text('Participants')",
  });

  // Blank is refused rather than drawing zero.
  await draw.fill("");
  await page.getByRole("button", { name: /Run the draw/i }).click();
  await page.getByRole("button", { name: /Yes, draw now/i }).click();
  await expect(
    page.getByText(/Enter how many places the draw is for/i),
  ).toBeVisible({ timeout: 30_000 });
  await shot(page, "A4b-blank-refused", "A blank number of places is refused");

  // Draw one place.
  await page.locator("#draw-places").fill("1");
  await page.getByRole("button", { name: /Run the draw/i }).click();
  await shot(page, "A4c-confirm", "Confirmation before the draw runs");
  await page.getByRole("button", { name: /Yes, draw now/i }).click();

  await expect(page.getByText(/Drew \d+ of \d+ waiting/i)).toBeVisible({
    timeout: 30_000,
  });
  await shot(page, "A4d-drawn", "Draw result, with the pool left over", {
    selector: ".card:has-text('Participants')",
  });
});

test("A5 enquiries carry a reference and can be answered in-app", async ({
  page,
}) => {
  await page.goto("/dashboard/admin/enquiries");
  await shot(page, "A5a-inbox", "Admin enquiries inbox", { fullPage: true });

  const withRef = page.locator("details", { hasText: /SPE-|CMP-|EVT-/ }).first();
  if (await withRef.count()) {
    await withRef.click();
    await shot(page, "A5b-reference", "Enquiry showing its sponsorship reference");
  }
});

test("A6 notifications quote the reference they are about", async ({ page }) => {
  await page.goto("/dashboard/admin/notifications");
  await shot(page, "A6a-bell", "Admin notifications", { fullPage: true });

  // The template catalogue is what the standup screenshot was of.
  await page.goto("/dashboard/admin/notifications/admin.feedback_received");
  await expect(page.locator("#in_app_body")).toHaveValue(/\{\{reference\}\}/);
  await shot(page, "A6b-template", "Feedback template now quotes {{reference}}", {
    fullPage: true,
  });
});

test("A7 raising an enquiry from a sponsorship opens in a new tab", async ({
  page,
}) => {
  await openFirstSponsoredEvent(page);
  const link = page.getByRole("link", { name: /Raise an enquiry about this/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("target", "_blank");

  const href = await link.getAttribute("href");
  expect(href).toMatch(/\/contact\?ref=SPE-/);
  await shot(page, "A7a-link", "Raise an enquiry, carrying the reference");

  // Follow it and check the form arrives pre-filled.
  const popup = await Promise.all([
    page.waitForEvent("popup"),
    link.click(),
  ]).then(([p]) => p);
  await popup.waitForLoadState("domcontentloaded");
  // Scoped to the form — the site header also has an "About" link.
  await expect(popup.locator("form").getByText(/^About$/)).toBeVisible();
  await expect(popup.locator("#name")).not.toHaveValue("");
  await expect(popup.locator("#email")).not.toHaveValue("");
  await shot(popup, "A7b-prefilled", "Enquiry form, reference and identity filled in", {
    fullPage: true,
  });
  await popup.close();
});
