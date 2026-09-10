import { test, expect } from "@playwright/test";
import { beat, caption, signIn, signOut, titleCard } from "./walkthrough-kit";

/**
 * Walkthrough recording of the new public, link-shareable pre-event survey
 * feature (migration 0037_public_surveys.sql) — built in response to the
 * 4/7 Sep standups: a pre-event survey must be answerable by a stranger with
 * no account, end in a CTA, and (when the visitor creates an account off the
 * back of it) land them already registered for the event behind the survey.
 *
 * Runs against a **local dev build** (`npm run build && npm run start`),
 * not the deployed site — this feature isn't deployed yet. See the
 * `public-survey-video` project in playwright.config.ts.
 *
 * Not fully read-only like the other walkthrough recordings: the anonymous
 * submission step genuinely writes a survey_responses row each run (there's
 * no account to reset it against, unlike the authenticated specs). That's
 * the point — it demonstrates the real pipeline, not a mock of it.
 *
 * Fixture used: the "Autumn Session – Fan Survey" template created against
 * CMP-00003 / SPE-00003 (Midnight Collective × Brand — Autumn Session),
 * template id 3947a5ad-d6b5-4ee0-a98c-420cf98324ff.
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };
const SURVEY_ID = "3947a5ad-d6b5-4ee0-a98c-420cf98324ff";

test("public pre-event surveys — walkthrough", async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto("/");
  await titleCard(
    page,
    "Public pre-event surveys",
    "A link anyone can answer — no account required",
  );
  await beat(page, 900);

  // ---- 1. Admin: authoring a public survey ---------------------------------
  await titleCard(page, "Setting it up as an admin", "1 of 3");
  await signIn(page, ADMIN);

  await page.goto(`/dashboard/admin/surveys/${SURVEY_ID}`);
  await beat(page, 600);
  await caption(
    page,
    "The event this survey is attached to, right on the builder",
    "Resolved through the campaign — so context is never a tab switch away.",
  );
  await beat(page, 3200);

  await page
    .locator("text=Public survey link")
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await caption(
    page,
    "Public & link-shareable",
    "Toggled on when this survey was created — this is the link that goes out.",
  );
  await beat(page, 3200);

  await page.locator("details summary", { hasText: "Survey details" }).click();
  await beat(page, 500);
  await caption(
    page,
    "Intro and thank-you copy, plus the public toggle",
    "All additive to the existing survey builder — nothing about the authenticated flow changed.",
  );
  await beat(page, 3600);

  const videoQuestion = page.locator(".card", { hasText: "How excited are you" });
  await videoQuestion.scrollIntoViewIfNeeded().catch(() => {});
  await caption(
    page,
    "A question can carry an image or an embedded video",
    "Images upload to the media bucket; video stays an embed link (YouTube/Vimeo/Loom) — no direct uploads, for performance.",
  );
  await beat(page, 3600);

  await signOut(page);

  // ---- 2. Answering it as a stranger ----------------------------------------
  await titleCard(page, "Answering it — no account needed", "2 of 3");
  await page.goto(`/survey/${SURVEY_ID}`);
  await beat(page, 800);
  await caption(
    page,
    "A short 'About you' step for anyone without a session",
    "Name, email, phone, a rough age range, residency and consent — enough to record a response and screen for duplicates, without asking for a password.",
  );
  await beat(page, 4200);

  await page.locator("#first_name").fill("Alex");
  await page.locator("#last_name").fill("Morgan");
  await page.locator("#email").fill(`alex.morgan.${Date.now()}@example.org`);
  await page.locator("#phone").fill("7911001122");
  await page.locator("#age_range").selectOption("25-34");
  await page.locator('input[name="residency_confirmed"]').check();
  await page.locator('input[name="consent_accepted"]').check();
  await beat(page, 1200);

  await videoQuestion
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await caption(page, "The video embeds right on the question", "");
  await beat(page, 2400);

  await page.getByLabel("Very excited").check();
  await page
    .locator(".card", { hasText: "favourite Midnight Collective track" })
    .locator("input")
    .fill("Skyline Echo");
  await beat(page, 900);

  await page.getByRole("button", { name: "Submit survey" }).click();
  await expect(page.getByText("Thanks for taking part!")).toBeVisible({ timeout: 20_000 });
  await caption(
    page,
    "The CTA — join the community, register for the event",
    "That link carries the event's own reference, so a new account lands already registered, not just signed up.",
  );
  await beat(page, 4200);

  // ---- 3. Back in the admin console ------------------------------------------
  await titleCard(page, "Back in the admin console", "3 of 3");
  await signIn(page, ADMIN);

  // The quality engine scores the response the moment it's submitted, so it
  // can land in review, pass or reject depending on how the answers looked
  // (a scripted fill is fast enough to sometimes trip the completion-time
  // signal) — check every tab rather than assuming one.
  let onQueue = false;
  for (const status of ["review", "pass", "reject", "pending"]) {
    await page.goto(`/dashboard/admin/surveys/responses?status=${status}`);
    if (await page.getByText("Alex Morgan").first().isVisible().catch(() => false)) {
      onQueue = true;
      break;
    }
  }
  expect(onQueue).toBe(true);
  await beat(page, 800);
  await caption(
    page,
    "The response shows up with a real name and a 'public' tag",
    "Not the existing account-linked flow — an anonymous respondent's captured identity, scored by the same 9-signal quality engine.",
  );
  await beat(page, 4200);

  await page.getByText("Alex Morgan").first().click();
  await page.waitForURL(/\/dashboard\/admin\/surveys\/responses\//);
  await beat(page, 800);
  await caption(
    page,
    "Full detail — email, phone, age range, residency, signal breakdown",
    "Everything the review queue already showed for an authenticated respondent, extended to cover a public one.",
  );
  await beat(page, 4200);
});
