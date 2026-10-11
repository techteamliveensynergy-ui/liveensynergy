import { test, type Page } from "@playwright/test";
import { beat, caption, signIn, signOut, titleCard } from "./walkthrough-kit";

/**
 * 9 Oct 2026 update video — the Admin Portal brief (PR #13, migrations
 * 0058–0060) plus the survey results work (0059):
 *
 *   1. Admin console overview (needs attention, platform, campaigns, funnel,
 *      active campaigns) and the new sidebar order.
 *   2. Users: "Inactive users" / "Inactive for more than 12 months".
 *   3. Brands and Artists pages.
 *   4. Campaign requests → full request page with Message brand.
 *   5. Campaigns live → the live-campaign page (order form, survey links,
 *      participants, codes, results, check-in, who-sees-what).
 *   6. Survey results page + anonymised downloads; Reporting & analysis.
 *   7. Compliance & audit.
 *   8. Brand's event page: live campaign block, no check-in QR; brand results.
 *   9. Artist's event page: live campaign block with check-in; campaign brief.
 *
 * READ-ONLY by design (it opens pages, never submits a form), so it is safe
 * against the deployed site — the default. Override with WALKTHROUGH_URL.
 *   npx playwright test --project=s1009-video
 * The video lands under test-results/…/video.webm; copy it into
 * docs/standup-2026-10-09/video/ by hand.
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };
const BRAND = { email: "brand.tester@example.com", password: "TestPass123!" };
const ARTIST = { email: "artist.tester@example.com", password: "TestPass123!" };

async function scrollThrough(page: Page, steps = 5, pause = 850) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(pause);
  }
  await page.mouse.wheel(0, -20000);
  await page.waitForTimeout(400);
}

async function visit(page: Page, path: string, title: string, detail = "") {
  await page.goto(path);
  await page.waitForLoadState("networkidle").catch(() => {});
  await caption(page, title, detail);
  await beat(page, 1800);
}

/**
 * Clicks the first link matching `selector` and waits for the page. Returns
 * false (and captions why) when there's nothing to open, so a thin test
 * dataset never fails the recording.
 */
async function openFirst(page: Page, selector: string, emptyNote: string): Promise<boolean> {
  const link = page.locator(selector).first();
  if ((await link.count()) === 0) {
    await caption(page, "Nothing to open here yet", emptyNote);
    await beat(page, 1600);
    return false;
  }
  await link.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  return true;
}

test.setTimeout(30 * 60_000);

test("9 Oct update: Admin Portal brief, live campaign, survey results, compliance", async ({ page }) => {
  await page.goto("/");
  await titleCard(
    page,
    "Live·En·Synergy — 9 Oct updates",
    "Admin console · Campaign requests · Live campaign · Survey results · Compliance & audit",
  );
  await beat(page, 3000);

  // ------------------------------------------------------------ admin
  await signIn(page, ADMIN);
  await visit(page, "/dashboard/admin", "1 · Admin console", "Needs attention, platform totals, revenue, campaigns, audience funnel, active campaigns.");
  await scrollThrough(page, 6);
  await caption(page, "New sidebar order", "Brands and Artists, Campaign requests and Campaigns live, Reporting & analysis, Compliance & audit.");
  await beat(page, 2600);

  await visit(page, "/dashboard/admin/users?activity=inactive_12m", "2 · Users — inactivity filters", "\"Inactive users\" and \"Inactive for more than 12 months\" (never-used accounts count from sign-up).");
  await visit(page, "/dashboard/admin/brands", "3 · Brands", "Each brand with open requests, campaigns, live count — Account and Message links.");
  await visit(page, "/dashboard/admin/artists", "Artists (replaces Events)", "Artists and pre-merge organisers with listings and sponsorships; all events one click away.");

  // Campaign requests: prefer one still waiting, else any converted one.
  await visit(page, "/dashboard/admin/campaigns/intake", "4 · Campaign requests", "What brands submit, before it becomes a campaign. Every request now opens.");
  let opened = await openFirst(page, 'a[href^="/dashboard/admin/campaigns/intake/"]:has-text("View details")', "No waiting requests.");
  if (!opened) {
    await page.goto("/dashboard/admin/campaigns/intake?status=converted");
    opened = await openFirst(page, 'a[href^="/dashboard/admin/campaigns/intake/"]:has-text("View details")', "No converted requests either.");
  }
  if (opened) {
    await caption(page, "The full request, read-only", "Exactly what the brand sent. Message brand starts the conversation; approve, continue or decline.");
    await beat(page, 2200);
    await scrollThrough(page, 4);
  }

  // Campaigns live → live-campaign page.
  await visit(page, "/dashboard/admin/campaigns", "5 · Campaigns live", "Everything after a request is accepted. New \"Live (event confirmed)\" filter; Message brand on every card.");
  await page.goto("/dashboard/admin/campaigns?live=yes");
  await page.waitForLoadState("networkidle").catch(() => {});
  let hub = await openFirst(page, 'a:has-text("Open campaign")', "No live campaign right now — opening any campaign instead.");
  if (!hub) {
    await page.goto("/dashboard/admin/campaigns");
    hub = await openFirst(page, 'a:has-text("Open campaign")', "No campaigns yet.");
  }
  if (hub) {
    await caption(page, "The live-campaign page", "Brief, budget, invoice, brand contact, where it came from — Edit is now secondary.");
    await beat(page, 2200);
    await page.mouse.wheel(0, 520);
    await caption(page, "Live campaign block", "Order form · pre/post survey links · participants · codes issued · results · check-in. Each box says who else can see it.");
    await beat(page, 3200);
    await scrollThrough(page, 4);
  }

  // Survey results + reporting.
  await visit(page, "/dashboard/admin/surveys", "6 · Survey results", "Every survey now has a Results page.");
  if (await openFirst(page, 'a[href$="/results"]:has-text("Results")', "No survey to open.")) {
    await caption(page, "Results, live while the survey is open", "Counters update with every response — the page reads a few rows however many responses there are.");
    await beat(page, 2400);
    await caption(page, "Anonymised downloads", "Responses, answers and question summary — RSP-/PER- IDs, no names, emails, phones or birth dates.");
    await beat(page, 2400);
    await scrollThrough(page, 7);
  }
  await visit(page, "/dashboard/admin/reports", "Reporting & analysis", "Every published survey's numbers side by side, with links to results and downloads.");

  await visit(page, "/dashboard/admin/compliance", "7 · Compliance & audit", "Each governance area with an honest status. Every data download is now recorded.");
  await scrollThrough(page, 5);
  await signOut(page);

  // ------------------------------------------------------------ brand
  await titleCard(page, "What the brand sees", "Same campaign, brand's view");
  await signIn(page, BRAND);
  await visit(page, "/dashboard/sponsored", "8 · Brand — sponsored events");
  if (await openFirst(page, 'a[href^="/dashboard/sponsored/"]', "No sponsored event for this brand.")) {
    await caption(page, "Live campaign block — brand view", "Full order form, survey links, participant and code totals, survey results. No check-in QR (artist and audience only).");
    await beat(page, 3200);
    await scrollThrough(page, 3);
    if (await openFirst(page, 'a[href^="/dashboard/survey-results/"]', "No published survey on this campaign yet.")) {
      await caption(page, "Brand survey results", "Totals only — no names, no individual answers, no open text, nothing until 5 responses are in.");
      await beat(page, 3000);
      await scrollThrough(page, 4);
    }
  }
  await signOut(page);

  // ------------------------------------------------------------ artist
  await titleCard(page, "What the artist sees", "Same campaign, artist's view");
  await signIn(page, ARTIST);
  await visit(page, "/dashboard/sponsored", "9 · Artist — sponsored events");
  if (await openFirst(page, 'a[href^="/dashboard/sponsored/"]', "No sponsored event for this artist.")) {
    await caption(page, "Live campaign block — artist view", "Campaign brief (permitted sections only), survey links, totals, codes issued — never who got which code. Check-in QR is here.");
    await beat(page, 3200);
    await scrollThrough(page, 5);
  }
  await visit(page, "/dashboard/campaign-briefs", "Campaign brief", "Only the order-form sections marked \"ok for artist to see\" — no research, contacts or commercials.");
  await signOut(page);

  await titleCard(page, "Thanks", "9 Oct updates · Live·En·Synergy");
});
