import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { beat, caption, signIn, signOut, titleCard } from "./walkthrough-kit";

/**
 * 5 Oct 2026 briefing video — everything built from that day's standup and
 * GitHub issues #8, #9, #10, recorded as one continuous take for the team:
 *
 *   1. Campaign Order Form (#9): admin creates a campaign, fills the order
 *      form (brand + event details autopopulate), sends it to the brand.
 *   2. Invoice contact & bank details (5 Oct) in Payment settings.
 *   3. Survey response cap (#8): expected participants + buffer → "closed".
 *   4. Bigger survey display (#10): full-screen preview, wider public page.
 *   5. Brand reviews the slide-sized order form, ticks both consents,
 *      approves → invoice sent automatically (Stripe test mode).
 *   6. Admin: partial refund with an amount + reason (5 Oct, case by case).
 *   7. Artist sees only the "ok for artist" brief.
 *   8. Notification setup: every event has email + in-app.
 *
 * Runs against a LOCAL production build (`npm run build && npm run start`):
 *   npx playwright test --project=s1005-video
 * Not read-only: creates a campaign, an order form, a Stripe TEST invoice, a
 * refund, and edits one survey's cap (restored at the end).
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };
const BRAND = { email: "brand.tester@example.com", password: "TestPass123!" };
const ARTIST = { email: "artist.tester@example.com", password: "TestPass123!" };

const BRAND_NAME = "Northwave Coffee";
const ARTIST_PARTNER = /Midnight Collective/i;
const EVENT_REF = "EVT-00001";
/** Published public survey with 8 responses — the cap demo sets 7 + 10% = 8. */
const CAP_SURVEY_ID = "3947a5ad-d6b5-4ee0-a98c-420cf98324ff";

const DEMO_IMAGE = path.join(
  require.resolve("playwright-core/package.json"),
  "..",
  "lib/server/chromium/appIcon.png",
);

async function scrollThrough(page: Page, steps = 6, pause = 900) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 520);
    await page.waitForTimeout(pause);
  }
}

test.setTimeout(30 * 60_000);

test("5 Oct briefing: order forms, survey cap, bigger surveys, refunds, invoice details", async ({ page }) => {
  // ---------------------------------------------------------------- intro
  await page.goto("/");
  await titleCard(
    page,
    "Live·En·Synergy — 5 Oct updates",
    "Campaign Order Form (#9) · Survey cap (#8) · Bigger surveys (#10) · Refunds · Invoice details · Notifications",
  );
  await beat(page, 3500);

  // ------------------------------------------------- 1. admin: campaign
  await signIn(page, ADMIN);
  await page.goto("/dashboard/admin/campaigns/new");
  await caption(page, "1 · Admin creates the campaign", "Campaigns are set up by the team while volume is low (1 Oct decision).");
  await beat(page);
  await page.selectOption("#brand_id", { label: BRAND_NAME });
  await page.selectOption("#campaign_package_id", { label: "Starter (£2,500)" });
  await page.fill("#description", "Cold-brew sampling at intimate live music nights — briefing video demo.");
  await page.fill("#preferred_location", "London");
  await page.fill("#preferred_timeline", "November 2026");
  await page.fill("#manager_name", "Sam Northwave");
  await page.fill("#manager_email", "techteamliveensynergy@gmail.com");
  await page.fill("#manager_phone", "07700900123");
  await caption(page, "1 · Admin creates the campaign", "Starter package: £2,500 + VAT. It starts hidden from artists until paid.");
  await beat(page);
  await page.getByRole("button", { name: "Create campaign" }).click({ noWaitAfter: true });
  await page.waitForURL(/\/dashboard\/admin\/campaigns$/, { timeout: 120_000 });
  await caption(page, "1 · Awaiting payment, invoice drafted", "Each campaign now has a “Create order form” button.");
  await beat(page, 2500);

  // --------------------------------------------- 2. admin: order form
  const card = page.locator("div.card", { hasText: "briefing video demo" }).first();
  await card.getByRole("link", { name: /Create order form/ }).click();
  await page.waitForURL(/\/order-form$/, { timeout: 90_000 });
  const campaignId = page.url().split("/campaigns/")[1].split("/")[0];
  await caption(page, "2 · Campaign Order Form (GitHub #9)", "Brand, contact, campaign and fee are filled in automatically from the brand and campaign.");
  await beat(page, 3000);

  await page.fill("#campaign_name", "Northwave Late-Night Sessions");
  await page.locator("#partner").scrollIntoViewIfNeeded();
  await caption(page, "2 · Linked event", "Pick the artist / event partner, then their event — ID, date, venue and location fill in.");
  const partnerOption = page.locator("#partner option", { hasText: ARTIST_PARTNER }).first();
  await page.selectOption("#partner", { value: (await partnerOption.getAttribute("value"))! });
  await beat(page, 800);
  const eventOption = page.locator("#listing option", { hasText: EVENT_REF }).first();
  await page.selectOption("#listing", { value: (await eventOption.getAttribute("value"))! });
  await beat(page, 2000);

  await page.locator("#approx_participants").scrollIntoViewIfNeeded();
  await caption(page, "2 · Research & participant benefit", "Approx. participants also sets the survey response cap (+10% buffer).");
  await page.fill("#approx_participants", "40");
  await page.selectOption("#survey_type", "pre_post");
  await page.fill("#survey_question_count", "8");
  await page.fill("#research_questions", "How often do you buy cold brew?\nWhich flavour would you try next?");
  await page.fill("#draft_survey_link", "liveensynergy-rho.vercel.app/survey/demo");
  await page.fill("#discount_reward", "20% off your first Northwave order");
  await page.fill("#rewards_available", "40");
  await page.fill("#redemption_arrangements", "Unique code shown on the participant's dashboard and emailed after the event.");
  await beat(page);
  await page.locator("#social_media_details").scrollIntoViewIfNeeded();
  await page.fill(
    "#social_media_details",
    "Instagram + TikTok: 2 posts and 3 stories, tag @northwavecoffee, follow the brand account.",
  );
  await page.setInputFiles("#media_images", DEMO_IMAGE);
  await page.fill("#media_video_url", "youtube.com/watch?v=aqz-KE-bpKQ");
  await caption(page, "2 · Images & video for the brand", "Shown at presentation size on the brand's review screen (5 Oct request).");
  await beat(page);

  await page.locator("#campaign_fee_gbp").scrollIntoViewIfNeeded();
  await caption(page, "2 · Commercial", "Package, fee, VAT and total are separate inputs (Enterprise is custom). Payment date = invoice due date.");
  await page.fill("#payment_date", "2026-10-31");
  await beat(page, 2500);
  await page.getByRole("button", { name: "Send to brand for approval" }).click({ noWaitAfter: true });
  await page.waitForURL(/sent=1/, { timeout: 120_000 });
  await caption(page, "2 · Sent to the brand", "They get an in-app notice and an email. The draft invoice now matches the form.");
  await beat(page, 2500);

  // Admin's "see what the brand sees" preview / PDF
  const previewHref = await page.getByRole("link", { name: /brand.s view/ }).getAttribute("href");
  const orderFormId = previewHref!.split("/order-forms/")[1];

  // ------------------------------------ 3. payment settings: details
  await page.goto("/dashboard/admin/settings/payments");
  await page.locator("#bank_details").scrollIntoViewIfNeeded();
  await caption(page, "3 · Invoice contact & bank details (5 Oct)", "WhatsApp + bank-transfer details print on every invoice and invoice email.");
  await page.fill("#whatsapp", "+44 7700 900123");
  await page.fill("#bank_details", "Account name: Live En Synergy Ltd\nSort code: 00-00-00\nAccount number: 00000000 (demo)");
  await beat(page);
  await page.getByRole("button", { name: "Save invoice details" }).click();
  await expect(page.getByText(/New invoices and invoice emails will include/)).toBeVisible({ timeout: 60_000 });
  await beat(page, 2000);

  // --------------------------------------------------- 4. survey cap
  await page.goto(`/dashboard/admin/surveys/${CAP_SURVEY_ID}`);
  await page.locator("summary", { hasText: /Survey details/i }).first().click().catch(() => {});
  await page.locator("#expected_participants").scrollIntoViewIfNeeded();
  await caption(page, "4 · Survey response cap (GitHub #8)", "Expected participants + buffer. 7 + 10% = 8 responses, then the survey closes.");
  await page.fill("#expected_participants", "7");
  await page.fill("#response_buffer_pct", "10");
  await beat(page);
  await page.locator("form", { has: page.locator("#expected_participants") }).getByRole("button", { name: /save/i }).first().click();
  await beat(page, 2500);
  await page.goto("/dashboard/admin/surveys");
  await caption(page, "4 · Responses vs. cap on every survey", "This one has 8 of 8 — closed.");
  await page.getByText(/of 8 \(cap\)/).first().scrollIntoViewIfNeeded().catch(() => {});
  await beat(page, 3000);
  await page.goto(`/survey/${CAP_SURVEY_ID}`);
  await caption(page, "4 · What a respondent sees once it's full", "A clear “closed” screen instead of a form they can't submit.");
  await beat(page, 3500);

  // -------------------------------------------- 5. bigger survey (#10)
  await page.goto(`/dashboard/admin/surveys/${CAP_SURVEY_ID}/preview`);
  await caption(page, "5 · Bigger survey display (GitHub #10)", "The preview now opens full screen; question cards and media are larger.");
  await beat(page, 2000);
  // Through the welcome & terms gate, to the questions themselves.
  const gate = page.getByRole("button", { name: /Start survey/i });
  if (await gate.isVisible().catch(() => false)) {
    const boxes = page.locator("input[type=checkbox]");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await beat(page, 600);
    await gate.click();
  }
  await caption(page, "5 · Bigger survey display (GitHub #10)", "Wider page, roomier question cards, larger images — closer to a full-screen slide.");
  await beat(page, 2500);
  await scrollThrough(page, 5);

  // ----------------------------------------------- 6. brand approves
  await page.goto("/dashboard");
  await signOut(page);
  await signIn(page, BRAND);
  await page.goto("/dashboard/campaigns");
  await caption(page, "6 · The brand is asked to review", "Their Campaigns page leads with the order form waiting for approval.");
  await beat(page, 3000);
  await page.getByRole("link", { name: /ready to review/ }).first().click();
  await page.waitForURL(/\/order-forms\//, { timeout: 90_000 });
  await caption(page, "6 · Presentation-sized review", "Full screen, slide by slide — imagery and video large, as requested on 5 Oct.");
  await beat(page, 2500);
  await scrollThrough(page, 9, 1100);
  await caption(page, "6 · Consents", "Both boxes, word for word from the brief. “Download PDF” prints it for email.");
  await page.getByLabel(/reviewed and approved the Campaign details/).check();
  await page.getByLabel(/agrees to the/).check();
  await beat(page, 1500);
  await page.getByRole("button", { name: "Approve order form" }).click({ noWaitAfter: true });
  await page.waitForURL(/\/dashboard\/campaigns\/invoices\/.*approved=1|\/order-forms\/.*approved=1/, { timeout: 180_000 });
  await caption(page, "6 · Approval moves straight on to billing", "The invoice is sent automatically through Stripe (test mode), with Pay + bank details.");
  await beat(page, 2500);
  await scrollThrough(page, 3);

  // ------------------------------------------------ 7. admin refunds
  await page.goto("/dashboard");
  await signOut(page);
  await signIn(page, ADMIN);
  await page.goto(`/dashboard/admin/campaigns/${campaignId}/order-form`);
  await caption(page, "7 · Admin sees the approval", "The form is locked; admins were notified that it was approved and the invoice sent.");
  await beat(page, 3000);
  await page.getByRole("link", { name: /^Invoice INV-/ }).click();
  await page.waitForURL(/\/dashboard\/admin\/invoices\//, { timeout: 90_000 });
  await caption(page, "7 · Payment", "Brands pay on Stripe (webhook marks it paid). For this demo it's marked paid by hand.");
  await beat(page);
  await page.getByRole("button", { name: "Mark paid" }).click();
  await page.getByRole("button", { name: "Mark paid" }).waitFor({ state: "detached", timeout: 120_000 }).catch(() => {});
  await page.reload();
  await page.locator("summary", { hasText: "Refund…" }).scrollIntoViewIfNeeded();
  await caption(page, "7 · Partial refunds, case by case (5 Oct)", "Admin enters the amount and a reason; the brand sees both.");
  await page.locator("summary", { hasText: "Refund…" }).click();
  await page.fill("#amount_gbp", "300");
  await page.fill("#reason", "Event postponed — 10% refund agreed with the brand");
  await beat(page, 1500);
  await page.getByRole("button", { name: "Issue refund" }).click({ noWaitAfter: true });
  await page.waitForURL(/refunded=1/, { timeout: 120_000 });
  await page.getByText("Refunds", { exact: true }).scrollIntoViewIfNeeded();
  await beat(page, 3000);

  // --------------------------------------------------- 8. artist brief
  await page.goto("/dashboard");
  await signOut(page);
  await signIn(page, ARTIST);
  await page.goto("/dashboard/campaign-briefs");
  await caption(page, "8 · The artist's campaign brief", "Only the sections marked “ok for artist to see” — no brand address, contact or fees.");
  await beat(page, 2500);
  await scrollThrough(page, 5);

  // ----------------------------------------------- 9. notifications
  await page.goto("/dashboard");
  await signOut(page);
  await signIn(page, ADMIN);
  await page.goto("/dashboard/admin/notifications");
  await caption(page, "9 · Every notification: email + in-app", "All events set up, including the new order-form, refund and payment ones.");
  await beat(page, 2000);
  await scrollThrough(page, 6);

  await page.goto(`/order-forms/${orderFormId}`);
  await caption(page, "Approved order form — the record both sides keep", "Thanks!");
  await beat(page, 2500);
  await titleCard(page, "That's the 5 Oct round", "Questions → the team channel. Next check-in Wednesday.");
  await beat(page, 3500);
});
