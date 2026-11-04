import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { beat, caption, signIn, signOut, titleCard } from "./walkthrough-kit";
import { envValue } from "./helpers";

/**
 * 17 Oct 2026 — one end-to-end round of the whole business, every role
 * playing its part, recorded as one continuous take:
 *
 *   artist lists an event (today) → admin creates the campaign → order form →
 *   brand approves → invoice through Stripe (TEST) → brand pays on Stripe's
 *   hosted page with a test card → webhook opens the campaign → artist
 *   registers interest → admin suggests the event → brand + artist agree →
 *   admin sets up discount codes → artist confirms them → admin builds and
 *   publishes pre/post-event surveys → admin opens registration → a brand-new
 *   audience member signs up, verifies their email, registers, passes the
 *   pre-event survey and gets a code automatically → admin selects them →
 *   ticket upload → QR check-in → post-event survey → brand sees the results.
 *
 * LOCAL production build only (`npm run build && npm run start`):
 *   npx playwright test --project=e2e-video
 * Not read-only: creates a listing, campaign, order form, Stripe TEST
 * invoice + payment, sponsored event, surveys, codes and an audience account,
 * all tagged with RUN below so they are easy to find and tidy up.
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };
const BRAND = { email: "brand.tester@example.com", password: "TestPass123!" };
const ARTIST = { email: "artist.tester@example.com", password: "TestPass123!" };

/** brand.tester's own brand. By id, not name: a real tester's brand is also
 *  called "Northwave Coffee" (found by this run's first attempt). */
const QA_BRAND_ID = "bd97155d-3cf6-4d1f-8c9a-3287e95e47cf";
const ARTIST_PARTNER = /Midnight Collective/i;

const stamp = new Date();
const RUN = `E2E ${stamp.toISOString().slice(5, 16).replace(/[-T:]/g, "")}`;
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(stamp);
const EVENT_NAME = `[${RUN}] Northwave Live Night`;
const AUDIENCE = {
  name: "Riley Test",
  email: `e2e-${RUN.slice(4)}@qa-liveensynergy.co.uk`,
  password: "E2eTest1017!",
};

const TICKET = path.join(
  require.resolve("playwright-core/package.json"),
  "..",
  "lib/server/chromium/appIcon.png",
);

/** Service-role read of the outbox — stands in for opening the email. */
async function verifyLinkFor(email: string): Promise<string> {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `${url}/rest/v1/email_outbox?select=body&event_key=eq.account.verify_email&to_email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const rows = (await res.json()) as { body: string }[];
    const m = rows[0]?.body.match(/\/auth\/verify-email\?token=[0-9a-f]+/);
    if (m) return m[0];
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("verify email never reached the outbox");
}

/** Service-role read: the audience member's participation status. */
async function participationStatus(email: string): Promise<string | undefined> {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  const prof = (await (await fetch(`${url}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`, { headers: h })).json()) as { id: string }[];
  const rows = (await (await fetch(`${url}/rest/v1/participations?select=status&audience_profile_id=eq.${prof[0]?.id}`, { headers: h })).json()) as { status: string }[];
  return rows[0]?.status;
}

async function scrollThrough(page: Page, steps = 4, pause = 800) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(pause);
  }
}

async function switchTo(page: Page, who: { email: string; password: string }) {
  await page.goto("/dashboard");
  await signOut(page);
  await signIn(page, who);
}

/** Answers whatever survey is on screen with the first option / short text,
 *  step by step if it's stepped, and doesn't submit before `minMs` so the
 *  quality engine's speed check doesn't mark it as rushed. */
async function answerSurvey(page: Page, minMs = 35_000) {
  const started = Date.now();
  const gate = page.getByRole("button", { name: /Start survey/i });
  if (await gate.isVisible().catch(() => false)) {
    const boxes = page.locator("input[type=checkbox]:visible");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await gate.click();
  }
  for (let round = 0; round < 30; round++) {
    const radios = page.locator("input[type=radio]:visible");
    const seen = new Set<string>();
    for (let i = 0; i < (await radios.count()); i++) {
      const name = (await radios.nth(i).getAttribute("name")) ?? `r${i}`;
      if (seen.has(name)) continue;
      seen.add(name);
      await radios.nth(i).check({ force: true });
      await page.waitForTimeout(250);
    }
    // Text fields have no type attribute; skip the off-screen honeypot.
    const texts = page.locator(
      "form textarea:visible, form input:not([type]):visible:not(#contact_reason), form input[type=text]:visible:not(#contact_reason)",
    );
    for (let i = 0; i < (await texts.count()); i++) {
      if (!(await texts.nth(i).inputValue())) await texts.nth(i).fill("Great night, friendly crowd and the coffee was excellent.");
    }
    const submit = page.getByRole("button", { name: "Submit survey" });
    if (await submit.isVisible().catch(() => false)) break;
    const next = page.getByRole("button", { name: /^Next/ });
    if (await next.isVisible().catch(() => false)) await next.click();
    await page.waitForTimeout(500);
  }
  const wait = minMs - (Date.now() - started);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.getByRole("button", { name: "Submit survey" }).click({ noWaitAfter: true });
}

test.setTimeout(60 * 60_000);

test("end to end: campaign → payment → artist → codes → survey → audience reward", async ({ page }) => {
  let campaignId = "";
  let orderFormId = "";
  let sponsoredId = "";
  let preSurveyId = "";

  await page.goto("/");
  await titleCard(page, "Live·En·Synergy — full end-to-end run", `${RUN} · admin · brand · artist · audience · Stripe test mode`);

  // ===================================================== 1. artist lists
  await test.step("artist lists an event", async () => {
    await signIn(page, ARTIST);
    await page.goto("/dashboard/events/new");
    await caption(page, "1 · Artist lists an event", "The Midnight Collective adds tonight's gig and makes it available to sponsors.");
    await page.fill("#name", EVENT_NAME);
    await page.locator('[name="event_date"]').fill(TODAY);
    await page.locator('[name="start_time"]').fill("19:30");
    await page.locator('[name="venue_name"]').fill("The Lexington");
    await page.locator('[name="city"]').fill("London");
    await page.locator('[name="capacity"]').fill("150");
    await page.locator('[name="make_available"]').check();
    await beat(page);
    await page.getByRole("button", { name: "Create event" }).click({ noWaitAfter: true });
    await page.waitForURL(/\/dashboard\/events$/, { timeout: 120_000 });
    await expect(page.getByText(EVENT_NAME).first()).toBeVisible();
    await caption(page, "1 · Listed", "Available to be matched with a sponsor.");
    await beat(page);
  });

  // ================================================== 2. admin campaign
  await test.step("admin creates the campaign", async () => {
    await switchTo(page, ADMIN);
    await page.goto("/dashboard/admin/campaigns/new");
    await caption(page, "2 · Admin creates the campaign", "For Northwave Coffee, Starter package. Hidden from artists until it's paid.");
    await page.selectOption("#brand_id", { value: QA_BRAND_ID });
    await page.selectOption("#campaign_package_id", { label: "Starter (£2,500)" });
    await page.fill("#campaign_name", `${RUN} Northwave Live`);
    await page.fill("#description", `${RUN}: cold-brew sampling at live music nights — end-to-end test.`);
    await page.fill("#preferred_location", "London");
    await page.fill("#preferred_timeline", "October 2026");
    await page.fill("#manager_name", "Sam Northwave");
    await page.fill("#manager_email", "techteamliveensynergy@gmail.com");
    await page.fill("#manager_phone", "07700900123");
    await beat(page);
    await page.getByRole("button", { name: "Create campaign" }).click({ noWaitAfter: true });
    await page.waitForURL(/\/dashboard\/admin\/campaigns$/, { timeout: 120_000 });
    const card = page.locator("div.card", { hasText: `${RUN}: cold-brew` }).first();
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    await caption(page, "2 · Awaiting payment", "An invoice is drafted automatically; matching is locked until it's paid.");
    await beat(page, 2200);

    // ---------------------------------------------- order form
    await card.getByRole("link", { name: /Create order form/ }).click();
    await page.waitForURL(/\/order-form$/, { timeout: 90_000 });
    campaignId = page.url().split("/campaigns/")[1].split("/")[0];
    await caption(page, "3 · Campaign Order Form", "Brand, contact and fee fill in from the campaign; the admin links the artist's event.");
    const partnerOption = page.locator("#partner option", { hasText: ARTIST_PARTNER }).first();
    await page.selectOption("#partner", { value: (await partnerOption.getAttribute("value"))! });
    await beat(page, 800);
    const eventOption = page.locator("#listing option", { hasText: RUN }).first();
    await page.selectOption("#listing", { value: (await eventOption.getAttribute("value"))! });
    await page.fill("#campaign_objective", "Introduce Northwave cold brew to a live-music audience and measure purchase intent.");
    await page.fill("#approx_participants", "40");
    await page.selectOption("#survey_type", "pre_post");
    await page.fill("#survey_question_count", "3");
    await page.fill("#discount_reward", "20% off your first Northwave order");
    await page.fill("#rewards_available", "40");
    await page.fill("#payment_date", TODAY);
    await beat(page);
    await page.getByRole("button", { name: "Send to brand for approval" }).click({ noWaitAfter: true });
    await page.waitForURL(/sent=1/, { timeout: 120_000 });
    const previewHref = await page.getByRole("link", { name: /brand.s view/ }).getAttribute("href");
    orderFormId = previewHref!.split("/order-forms/")[1];
    await caption(page, "3 · Sent to the brand", "They get an in-app notice and an email.");
    await beat(page, 2000);
  });

  // ================================================ 3. brand approves/pays
  let hostedInvoiceUrl: string | null = null;
  await test.step("brand approves the order form", async () => {
    await switchTo(page, BRAND);
    await page.goto(`/order-forms/${orderFormId}`);
    await caption(page, "4 · Brand reviews the order form", "Presentation-sized, slide by slide.");
    await scrollThrough(page, 5, 700);
    await page.getByLabel(/reviewed and approved the Campaign details/).check();
    await page.getByLabel(/agrees to the/).check();
    await beat(page);
    await page.getByRole("button", { name: "Approve order form" }).click({ noWaitAfter: true });
    await page.waitForURL(/approved=1/, { timeout: 180_000 });
    expect(page.url(), "approval should land on the sent invoice").toMatch(/\/dashboard\/campaigns\/invoices\//);
    await caption(page, "4 · Approved → invoice sent through Stripe (test mode)", "“Pay online” opens Stripe's hosted invoice.");
    await beat(page, 2000);
    hostedInvoiceUrl = await page.getByRole("link", { name: /Pay online/ }).getAttribute("href");
    expect(hostedInvoiceUrl).toMatch(/^https:\/\/invoice\.stripe\.com\//);
  });

  let paidOnStripe = false;
  let brandInvoiceUrl = "";
  await test.step("brand pays with a Stripe test card", async () => {
    brandInvoiceUrl = page.url();
    // Paying on Stripe's hosted page is opt-in (E2E_STRIPE_UI=1); by default
    // the admin records the payment with "Mark paid" below.
    if (!process.env.E2E_STRIPE_UI) return;
    await page.goto(hostedInvoiceUrl!);
    await page.waitForLoadState("networkidle").catch(() => {});
    await caption(page, "5 · Stripe hosted invoice (TEST mode)", "Paid with Stripe's published test card 4242 4242 4242 4242.");
    await beat(page, 1500);
    // Pay in GBP (Stripe offers the visitor's local currency first), then
    // open the Card accordion — its fields live in Stripe's payment iframe.
    const frameWith = async (sel: string) => {
      for (let i = 0; i < 20; i++) {
        for (const f of page.frames()) if (await f.locator(sel).count().catch(() => 0)) return f;
        await page.waitForTimeout(1000);
      }
      throw new Error(`no frame with ${sel}`);
    };
    const cur = await frameWith("#currency-gbp");
    await cur.locator("#currency-gbp").check({ force: true });
    const pay = await frameWith("button:has-text('Card'), #payment-numberInput");
    if (!(await pay.locator("#payment-numberInput").count())) await pay.getByRole("button", { name: "Card" }).click();
    await pay.locator("#payment-numberInput").waitFor();
    await pay.locator("#payment-numberInput").fill("4242424242424242");
    await pay.locator("#payment-expiryInput").fill("12 / 34");
    await pay.locator("#payment-cvcInput").fill("123");
    const postal = pay.locator("#payment-postalCodeInput");
    if (await postal.isVisible().catch(() => false)) await postal.fill("E1 6AN");
    await beat(page);
    await page.getByRole("button", { name: /^Pay/ }).first().click();
    paidOnStripe = await page
      .getByText(/Invoice paid|Payment successful|has been paid/i)
      .first()
      .waitFor({ timeout: 90_000 })
      .then(() => true)
      .catch(() => false);
    if (paidOnStripe) {
      await caption(page, "5 · Paid on Stripe", "Stripe now calls our webhook, which marks the invoice paid and opens the campaign.");
      await beat(page, 2000);
    }
  });

  // Stripe's hosted page runs its own bot check; if it ever challenges the
  // automated browser we don't try to get past it — the admin's documented
  // fallback (“Mark paid”) records the payment instead, and the run says so.
  await test.step("invoice is marked paid", async () => {
    if (!paidOnStripe) {
      test.info().annotations.push({ type: "payment", description: "Stripe hosted payment did not complete in automation; used admin Mark paid" });
      await switchTo(page, ADMIN);
      await page.goto(`/dashboard/admin/campaigns/${campaignId}/order-form`);
      await page.getByRole("link", { name: /^Invoice INV-/ }).click();
      await page.waitForURL(/\/dashboard\/admin\/invoices\//, { timeout: 90_000 });
      await caption(page, "5 · Admin records the payment", "Fallback when the card payment isn't made on Stripe's page.");
      await page.getByRole("button", { name: "Mark paid" }).click();
      await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 120_000 });
      await beat(page, 2000);
      await switchTo(page, BRAND);
    }
    const invoicePage = brandInvoiceUrl;
    // The webhook lands on the deployed site (shared database) within seconds.
    await page.goto(invoicePage.replace(/\?.*$/, ""));
    await expect(async () => {
      await page.reload();
      await expect(page.getByText(/Paid on/)).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 120_000, intervals: [3_000] });
    await caption(page, paidOnStripe ? "5 · Invoice marked paid by the Stripe webhook" : "5 · Invoice paid", paidOnStripe ? "No admin action needed — and the campaign opened itself." : "The campaign opens with it.");
    await beat(page, 2000);
  });

  // ================================================== 4. artist interest
  await test.step("artist registers interest", async () => {
    await switchTo(page, ARTIST);
    await page.goto("/dashboard/discover-campaigns");
    const row = page.locator("div.card, li, article", { hasText: RUN }).first();
    await expect(row, "the paid campaign should be open to artists").toBeVisible({ timeout: 30_000 });
    await row.scrollIntoViewIfNeeded();
    await caption(page, "6 · The campaign is now open to artists", "The artist registers interest; the team is notified.");
    await beat(page);
    await row.getByRole("button", { name: "Register interest" }).click();
    await page.waitForURL(/registered=/, { timeout: 60_000 });
    await beat(page, 1500);
  });

  // ================================================ 5. admin matches
  await test.step("admin suggests the event", async () => {
    await switchTo(page, ADMIN);
    await page.goto("/dashboard/admin/campaigns");
    const card = page.locator("div.card", { hasText: `${RUN}: cold-brew` }).first();
    await card.scrollIntoViewIfNeeded();
    await caption(page, "7 · Admin matches the campaign to the artist's event", "Paid, so matching is unlocked.");
    await card.locator("label", { hasText: EVENT_NAME }).locator("input[name=listing_id]").check();
    await beat(page);
    await card.getByRole("button", { name: /Suggest/ }).click({ noWaitAfter: true });
    await page.waitForURL(/\/dashboard\/admin\/events\/sponsored\/[0-9a-f-]{36}/, { timeout: 120_000 });
    sponsoredId = page.url().split("/sponsored/")[1].split(/[/?#]/)[0];
    await caption(page, "7 · Proposed", "Brand and artist must both agree to the terms.");
    await beat(page, 2000);
  });

  const agree = async (who: typeof BRAND, label: string) => {
    await switchTo(page, who);
    await page.goto(`/dashboard/sponsored/${sponsoredId}`);
    await caption(page, label, "Reviews the terms and agrees.");
    await beat(page);
    await page.getByRole("button", { name: "I agree to these terms" }).click();
    await page.getByRole("button", { name: /Yes, (I agree|confirm it)/ }).click({ noWaitAfter: true });
    await expect(page.getByRole("button", { name: "I agree to these terms" })).toHaveCount(0, { timeout: 60_000 });
    await beat(page, 1500);
  };
  await test.step("brand agrees", () => agree(BRAND, "8 · Brand agrees"));
  await test.step("artist agrees", () => agree(ARTIST, "8 · Artist agrees → sponsorship confirmed"));

  // =============================================== 6. discount codes
  await test.step("admin sets up discount codes", async () => {
    await switchTo(page, ADMIN);
    await page.goto(`/dashboard/admin/events/sponsored/${sponsoredId}#discount-codes`);
    const section = page.locator("#discount-codes");
    await section.scrollIntoViewIfNeeded();
    await caption(page, "9 · Admin sets up the discount codes", "20% off, unique codes generated by the platform.");
    const t1 = section.getByTestId("reward-tier").nth(0);
    await t1.locator('[name="tier_label"]').fill("Survey reward · 20% off");
    await t1.locator('[name="tier_model"]').selectOption("unique");
    await t1.locator('[name="tier_cap"]').fill("40");
    await t1.locator('[name="tier_discount_percent"]').fill("20");
    await t1.locator('[name="tier_prefix"]').fill("NWLIVE");
    const t2 = section.getByTestId("reward-tier").nth(1);
    if (await t2.count()) await t2.locator('[name="tier_label"]').fill("");
    await section.getByRole("button", { name: "Save tiers" }).click();
    await expect(section.getByText("Tiers saved.")).toBeVisible({ timeout: 60_000 });
    const pool = page.locator("#discount-codes").getByTestId("tier-codes").nth(0);
    await pool.locator('[name="count"]').fill("10");
    await pool.getByRole("button", { name: "Generate" }).click();
    await expect(pool.getByTestId("tier-code-counts")).toHaveText(/10 available/, { timeout: 60_000 });
    await beat(page);
    await page.getByRole("button", { name: "Send to artist for review" }).click();
    await expect(page.getByText("Sent to the artist")).toBeVisible({ timeout: 60_000 });
    await beat(page, 1500);
  });

  await test.step("artist confirms the codes", async () => {
    await switchTo(page, ARTIST);
    await page.goto(`/dashboard/sponsored/${sponsoredId}#discount-codes`);
    const s = page.locator("#discount-codes");
    await s.scrollIntoViewIfNeeded();
    await caption(page, "10 · Artist confirms the discount codes", "Codes can only be issued once the artist agrees.");
    await beat(page);
    await s.locator('[name="consent"]').check();
    await s.getByRole("button", { name: "Confirm discount codes" }).click();
    await expect(page.getByText("Confirmed — the team can now issue")).toBeVisible({ timeout: 60_000 });
    await beat(page, 1500);
  });

  // ==================================================== 7. surveys
  const buildSurvey = async (kind: "pre_event" | "post_event", title: string, qs: [string, string, string[]?][]) => {
    await page.goto("/dashboard/admin/surveys/new");
    await page.locator("#title").fill(title);
    await page.locator("#kind").selectOption(kind);
    // Options read "CMP-000xx · brand" — no campaign name — so pick by id.
    await page.locator("#campaign_id").selectOption({ value: campaignId });
    await page.getByRole("button", { name: "Create survey" }).click();
    await page.waitForURL(/\/dashboard\/admin\/surveys\/[0-9a-f-]{36}$/, { timeout: 90_000 });
    const id = page.url().split("/").pop()!;
    for (const [type, prompt, options] of qs) {
      await page.getByRole("button", { name: type, exact: false }).first().click();
      await page.locator("#q-prompt").fill(prompt);
      if (options) {
        const inputs = page.locator("input.input:not([id])");
        while ((await inputs.count()) < options.length) await page.getByRole("button", { name: "+ Add option" }).click();
        for (let i = 0; i < options.length; i++) await inputs.nth(i).fill(options[i]);
      }
      await page.waitForTimeout(400);
    }
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByRole("button", { name: "Unpublish to edit" })).toBeVisible({ timeout: 30_000 });
    return id;
  };

  await test.step("admin builds and publishes the surveys", async () => {
    await switchTo(page, ADMIN);
    await caption(page, "11 · Admin builds the pre-event survey", "Attached to the campaign; published.");
    preSurveyId = await buildSurvey("pre_event", `${RUN} — Pre-event`, [
      ["Single choice", "Have you heard of Northwave Coffee before?", ["Yes, I buy it", "Heard of it", "Never heard of it"]],
      ["Single choice", "How often do you buy iced or cold-brew coffee?", ["Weekly", "Monthly", "Rarely"]],
      ["Short text", "What drink would you want at a gig?"],
    ]);
    await beat(page, 1500);
    await caption(page, "11 · …and the post-event survey", "Only attendees who checked in see this one.");
    await buildSurvey("post_event", `${RUN} — Post-event`, [
      ["Single choice", "Did you try Northwave at the event?", ["Yes", "No"]],
      ["Single choice", "How likely are you to buy it now?", ["Very likely", "Maybe", "Unlikely"]],
      ["Short text", "Anything else you'd tell the brand?"],
    ]);
    await beat(page, 1500);
  });

  // ================================================ 8. open registration
  await test.step("admin opens registration", async () => {
    await page.goto(`/dashboard/admin/campaigns/${campaignId}`);
    const panel = page.locator("section, div.card", { hasText: "Registration and survey" }).last();
    await panel.scrollIntoViewIfNeeded();
    await caption(page, "12 · Everything's in place → open registration", "Agreed event ✓ · codes confirmed ✓ · survey published ✓");
    await beat(page, 2200);
    await page.getByRole("button", { name: "Open now…" }).click();
    const reason = page.locator("dialog[open] textarea[name=reason]");
    if (await reason.isVisible().catch(() => false)) await reason.fill("End-to-end test");
    await page.getByRole("button", { name: "Yes, open now" }).click({ noWaitAfter: true });
    await expect(page.getByText(/Open since/).first()).toBeVisible({ timeout: 60_000 });
    await beat(page, 2000);
  });

  // ============================================== 9. audience signs up
  await test.step("a new audience member signs up and verifies their email", async () => {
    await page.goto("/dashboard");
    await signOut(page);
    await page.goto("/auth/sign-up?role=audience");
    await caption(page, "13 · A new audience member signs up", AUDIENCE.email);
    await page.fill("#fullName", AUDIENCE.name);
    await page.fill("#email", AUDIENCE.email);
    await page.fill("#password", AUDIENCE.password);
    await page.locator('[name="terms_accepted"]').check();
    await beat(page);
    await page.locator('form button[type="submit"]').last().click({ noWaitAfter: true });
    await page.waitForURL(/\/onboarding/, { timeout: 120_000 });
    await caption(page, "13 · Account created → confirm-your-email link sent", "Opening the link from the email…");
    await beat(page, 1500);
    const link = await verifyLinkFor(AUDIENCE.email);
    await page.goto(link);
    await page.waitForURL(/\/(onboarding|dashboard)/, { timeout: 90_000 });
    await caption(page, "13 · Email verified", "Now the audience onboarding.");
    await beat(page);
    if (/\/onboarding/.test(page.url())) {
      if (!/\/onboarding\/audience/.test(page.url())) await page.goto("/onboarding/audience");
      await page.fill("#full_name", AUDIENCE.name);
      await page.fill("#phone", `7700${String(Date.now()).slice(-6)}`);
      await page.locator("#date_of_birth").fill("1996-04-12");
      await beat(page);
      await page.getByRole("button", { name: "Finish & explore events" }).click({ noWaitAfter: true });
      await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
    }
  });

  await test.step("audience registers for the event", async () => {
    await page.goto(`/dashboard/discover/${sponsoredId}`);
    await caption(page, "14 · Registers for tonight's event", EVENT_NAME);
    await beat(page);
    const fullName = page.locator("#full_name");
    if (!(await fullName.inputValue())) await fullName.fill(AUDIENCE.name);
    const dob = page.locator("#date_of_birth");
    if (!(await dob.inputValue())) await dob.fill("1996-04-12");
    const phone = page.locator("#phone");
    if (!(await phone.inputValue())) await phone.fill(`7700${String(Date.now()).slice(-6)}`);
    await page.locator('input[name="accept_terms"]').check();
    await page.getByRole("button", { name: "Confirm registration" }).click({ noWaitAfter: true });
    await page.waitForURL(/notice=registered/, { timeout: 120_000 });
    await caption(page, "14 · Registered", "Next: the pre-event survey.");
    await beat(page, 1800);
  });

  await test.step("audience passes the pre-event survey and gets a code", async () => {
    await page.getByRole("link", { name: /Take the pre-event/ }).first().click();
    await page.waitForURL(/\/dashboard\/surveys\//, { timeout: 90_000 });
    await caption(page, "15 · Pre-event survey", "Answered honestly and at a normal pace — the quality check scores it.");
    await answerSurvey(page);
    await page.waitForURL(/notice=survey-submitted/, { timeout: 120_000 });
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId("event-reward-code").first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000, intervals: [3_000] });
    await page.getByTestId("event-reward-code").first().scrollIntoViewIfNeeded();
    await caption(page, "15 · Survey passed → discount code issued automatically", "Also emailed to them.");
    await beat(page, 3000);
    await page.goto("/dashboard/rewards");
    await caption(page, "15 · Rewards page", "The code, its value and where to redeem it.");
    await beat(page, 2500);
  });

  // ======================================== 10. selection + check-in
  let attendPath = "";
  await test.step("admin selects the attendee", async () => {
    await switchTo(page, ADMIN);
    await page.goto(`/dashboard/admin/events/sponsored/${sponsoredId}`);
    await caption(page, "16 · Admin selects who attends", "A random draw from the registered audience.");
    // The pre-event pass already earned the code; the admin row must say so.
    await expect(page.getByText("survey passed").first()).toBeVisible();
    await expect(page.getByText("survey missing")).toHaveCount(0);
    await page.locator("#draw-places").fill("1");
    await page.getByRole("button", { name: "Run the draw" }).click();
    await page.getByRole("button", { name: "Yes, draw now" }).click({ noWaitAfter: true });
    await page.waitForLoadState("networkidle").catch(() => {});
    await beat(page, 2000);
    const html = await page.content();
    attendPath = html.match(/\/attend\/[A-Za-z0-9_-]{8,}/)![0];
  });

  await test.step("audience uploads a ticket and checks in by QR", async () => {
    await switchTo(page, AUDIENCE);
    await page.goto("/dashboard/participations");
    await caption(page, "17 · Selected → upload the ticket", "Proof they have a ticket for the night.");
    await page.locator('input[name="ticket_file"]').setInputFiles(TICKET);
    await page.getByRole("button", { name: "Upload ticket" }).click({ noWaitAfter: true });
    await page.waitForLoadState("networkidle").catch(() => {});
    await beat(page, 2000);
    await page.goto(attendPath);
    await caption(page, "17 · At the venue: scans the artist's QR code", "Confirms their own attendance (works on the day of the event).");
    await beat(page);
    await page.getByRole("button", { name: "Confirm my attendance" }).click({ noWaitAfter: true });
    await expect(page.getByText(/attendance (is )?(confirmed|verified)|You're checked in|checked in/i).first()).toBeVisible({ timeout: 60_000 });
    await beat(page, 2000);
  });

  await test.step("audience completes the post-event survey", async () => {
    await page.goto("/dashboard/participations");
    await caption(page, "18 · Post-event survey unlocked", "Only attendees see it.");
    await beat(page);
    await page.getByRole("link", { name: /Take the post-event/ }).first().click();
    await page.waitForURL(/\/dashboard\/surveys\//, { timeout: 90_000 });
    await answerSurvey(page);
    await page.waitForURL(/notice=survey-submitted/, { timeout: 120_000 });
    await caption(page, "18 · Done", "Registered → survey → code → attended → feedback.");
    // Checked in while already holding a code → reward released (0079).
    expect(await participationStatus(AUDIENCE.email)).toBe("reward_released");
    await beat(page, 2500);
  });

  // =============================================== 11. brand + admin end
  await test.step("brand sees the outcome", async () => {
    await switchTo(page, BRAND);
    await page.goto(`/dashboard/campaigns/live/${campaignId}`);
    await caption(page, "19 · The brand's view", "Checklist, invoice paid, sponsored event, survey results.");
    await scrollThrough(page, 4);
    await page.goto(`/dashboard/sponsored/${sponsoredId}`);
    await caption(page, "19 · Sponsored event", "Participants, survey completions and the discount codes (read-only).");
    await scrollThrough(page, 4);
    await page.goto(`/dashboard/survey-results/${preSurveyId}`);
    await caption(page, "19 · Survey results", "Per-question results appear once 5+ responses are counted.");
    await beat(page, 2500);
  });

  await test.step("admin sees the campaign live", async () => {
    await switchTo(page, ADMIN);
    await page.goto(`/dashboard/admin/campaigns/${campaignId}`);
    await caption(page, "20 · Admin: the campaign end to end", "Participants, verified, surveys completed, codes issued.");
    await scrollThrough(page, 5);
    await titleCard(page, "End-to-end run complete", RUN);
  });
});
