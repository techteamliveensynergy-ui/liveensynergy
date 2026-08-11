import { test, expect, type Page } from "@playwright/test";
import { readHandoff, shot } from "./helpers";

/** 10 Aug standup batch — brand seat. */

/**
 * Opens a sponsorship, not the "+ New sponsored event" button.
 * `a[href^="/dashboard/sponsored/"]` also matches `/dashboard/sponsored/new`,
 * which is the first link on the page.
 */
async function openASponsorship(page: Page, opts: { withParticipants?: boolean } = {}) {
  await page.goto("/dashboard/sponsored");
  const links = page
    .locator('a[href^="/dashboard/sponsored/"]')
    .filter({ hasNotText: /New sponsored event/ });
  await expect(links.first()).toBeVisible();

  const hrefs = [
    ...new Set(
      await links.evaluateAll((els) =>
        els.map((e) => (e as HTMLAnchorElement).pathname),
      ),
    ),
  ];

  // "No Select button" proves nothing on an event with nobody registered, so
  // where the check needs participants, find one that has them.
  for (const href of hrefs) {
    await page.goto(href);
    if (!opts.withParticipants) return;
    const heading = await page
      .getByRole("heading", { name: /^Participants \(\d+\)$/ })
      .first()
      .textContent()
      .catch(() => null);
    if (heading && !heading.includes("(0)")) return;
  }
  if (opts.withParticipants) {
    test.skip(true, "no sponsorship on this account has any registrations");
  }
}

/**
 * D2 — a brand's sponsored-events list is its own.
 *
 * Found while writing B1: the list selected every row and left the filtering
 * to RLS, but `sponsored_events: public read confirmed` (0002) exposes every
 * confirmed/completed row to any signed-in user so the audience can discover
 * events. Northwave Coffee's list was showing Fire X's confirmed deals — names,
 * budgets and remaining reward pools. See L7 in lessons.md.
 */
test("D2 a brand sees only its own sponsorships, not a rival's", async ({
  page,
}) => {
  await page.goto("/dashboard/sponsored");

  // Fire X's confirmed deals are the ones that used to leak in.
  await expect(
    page.getByText("Sakshi Live at AO Arena, Manchester"),
  ).toHaveCount(0);
  await expect(
    page.getByText("Midnight Collective × Brand — Autumn Session"),
  ).toHaveCount(0);

  // Northwave Coffee's own are still there.
  await expect(page.getByText(/Timezone Check/).first()).toBeVisible();
  await shot(page, "D2a-own-list", "Only this brand's own sponsorships", {
    fullPage: true,
  });
});

test("D2b a rival's sponsorship can't be opened by URL", async ({ page }) => {
  // Handed over by the admin spec — the brand cannot discover this id itself,
  // which is the whole point.
  const { rivalSponsorship } = readHandoff();
  test.skip(!rivalSponsorship, "no other brand's sponsorship was handed over");

  // Before the fix this rendered the deal's budget, service fee and remaining
  // reward pool to a brand with no relationship to it at all.
  const res = await page.goto(`/dashboard/sponsored/${rivalSponsorship}`);
  expect(res?.status()).toBe(404);
  await shot(page, "D2b-rival-404", "A rival's sponsorship is not reachable");
});

test("B1 selection is no longer the brand's to make", async ({ page }) => {
  await openASponsorship(page, { withParticipants: true });

  const panel = page.locator(".card:has-text('Participants')");
  await panel.scrollIntoViewIfNeeded();

  // Someone is actually listed, so the absence of the controls means something.
  await expect(panel.getByRole("heading", { name: /Participants \(0\)/ })).toHaveCount(0);

  // The two controls the standup asked to be removed.
  await expect(panel.getByRole("button", { name: /^Select$/ })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^Reject$/ })).toHaveCount(0);

  // …and the copy that explains why.
  await expect(panel.getByText(/drawn at random by the/i)).toBeVisible();
  await shot(page, "B1-participants", "No Select/Reject on the brand's panel", {
    selector: ".card:has-text('Participants')",
  });
});

test("B2 the enquiry link carries the sponsorship reference", async ({
  page,
}) => {
  await openASponsorship(page);

  const link = page.getByRole("link", { name: /Raise an enquiry/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("target", "_blank");
  expect(await link.getAttribute("href")).toMatch(/\/contact\?ref=SPE-/);
  await link.scrollIntoViewIfNeeded();
  await shot(page, "B2-enquiry-link", "Raise an enquiry from a sponsorship");
});

/**
 * The seeded CMP-00001 predates the campaign-manager fields being mandatory,
 * so it holds nulls for all three. Any edit to it — including adding a
 * suggestion — is blocked by the browser until they're filled in. Fill them if
 * they're blank, which is exactly what a brand would have to do.
 */
async function fillManagerIfBlank(page: Page) {
  for (const [id, value] of [
    ["#manager_name", "Northwave Marketing"],
    ["#manager_email", "marketing@northwave.example.com"],
    ["#manager_phone", "+44 7700 900321"],
  ] as const) {
    const field = page.locator(id);
    if ((await field.inputValue()) === "") await field.fill(value);
  }
}

test("B3 a brand can suggest an external event on a campaign", async ({
  page,
}) => {
  await page.goto("/dashboard/campaigns");
  await page.getByRole("link", { name: /^Edit$/ }).first().click();
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
  await fillManagerIfBlank(page);
  await page.getByRole("button", { name: /Save changes/i }).click();
  await expect(
    page.getByText(/suggested event link doesn't look like a valid link/i),
  ).toBeVisible({ timeout: 30_000 });
  await shot(page, "B3b-invalid", "An invalid suggestion link is reported");

  // A scheme-less one is accepted and canonicalised.
  await page.goto("/dashboard/campaigns");
  await page.getByRole("link", { name: /^Edit$/ }).first().click();
  await page.waitForURL(/\/dashboard\/campaigns\/[0-9a-f-]{36}/);
  await page
    .locator("#suggested_event_note")
    .fill(
      "Late-Shift Sessions at Peckham Audio, 14 March — merch stand + a story mention.",
    );
  await page.fill("#suggested_event_url", "eventbrite.co.uk/e/late-shift");
  await fillManagerIfBlank(page);
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

/**
 * D1 — the `getOrCreateConversation` lookup.
 *
 * Discover hides "Contact organiser" once a thread exists and offers "Open
 * conversation" instead, so the double-click path isn't reachable from this
 * page — which is why the broken lookup went unnoticed. What this checks is
 * the guarantee that survives: the enquiry opens a thread, and coming back
 * resolves to *that* thread rather than a second one. The reuse branch itself
 * is what the campaign relay depends on (A3/R2).
 */
test("D1 an enquiry opens one thread, and Discover points back at it", async ({
  page,
}) => {
  await page.goto("/dashboard/discover");

  const contact = page.getByRole("button", { name: /Contact organiser/i }).first();
  const alreadySent = page.getByText(/✓ Enquiry sent/).first();

  let conversationId: string | null = null;

  if (await contact.count()) {
    await contact.click();
    await page.waitForURL(/\/dashboard\/messages/, { timeout: 30_000 });
    conversationId = new URL(page.url()).searchParams.get("c");
    expect(conversationId).toBeTruthy();
    await shot(page, "D1a-first", "An enquiry opens a thread");
  } else {
    await expect(alreadySent).toBeVisible();
    await shot(page, "D1a-already", "A listing already enquired on");
  }

  // Back on Discover the button is replaced by a link to the existing thread.
  await page.goto("/dashboard/discover");
  const open = page.getByRole("link", { name: /Open conversation/i }).first();
  await expect(open).toBeVisible();
  const href = await open.getAttribute("href");
  if (conversationId) expect(href).toContain(conversationId);
  await shot(page, "D1b-same-thread", "Discover points back at the same thread");

  await open.click();
  await page.waitForURL(/\/dashboard\/messages\?c=/);
  await expect(page.locator("section.card")).toBeVisible();
  await shot(page, "D1c-thread", "…and it opens");
});
