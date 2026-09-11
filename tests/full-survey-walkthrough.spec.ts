import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { beat, caption, signIn, signOut, titleCard } from "./walkthrough-kit";

/**
 * Full walkthrough of the survey system — pre-event (public) AND post-event
 * (attendee-only) — plus a tour of the admin builder's full customization
 * surface, and a look at what else is live in the admin console.
 *
 * Runs against a local dev build only (this feature isn't deployed). See the
 * `full-survey-video` project in playwright.config.ts:
 *   WALKTHROUGH_URL=http://localhost:3010 npx playwright test --project=full-survey-video
 *
 * Not read-only: creates two real survey templates and real responses each
 * run (there's no account to reset them against). Uses two pre-seeded
 * accounts alongside the standard QA ones — see the constants below — set up
 * once via direct SQL before this spec is run (documented in the comment by
 * each constant).
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };
/** Already has an `attendance_verified`/`reward_released` participation on
 *  SPE-00001 (Late-Shift Sessions), so the post-event survey unlocks for it
 *  without any extra setup. */
const ATTENDEE = { email: "audience.tester@example.com", password: "TestPass123!" };
/**
 * Pre-seeded via direct SQL (auth.users, email_confirmed_at already set) —
 * this spec has no email inbox to click a real confirmation link, so this
 * account stands in for "already confirmed", same technique docs/qa-creds.md
 * itself uses for every seeded QA account. Its raw_user_meta_data carries
 * pending_event_reference: 'SPE-00002', so completing onboarding on this
 * account exercises the exact same registerPendingEvent() code path a real
 * confirmed signup would.
 */
const ONBOARDING_DEMO = { email: "video-onboarding-demo@qa-liveensynergy.co.uk", password: "TestPass123!" };

const CMP_2 = "1990e843-2528-458e-a3a3-406db208db76"; // has a confirmed sponsored event (SPE-00002)
const CMP_1 = "93214b86-c24c-4550-bee3-20374e15289b"; // Late-Shift Sessions, SPE-00001

/** A real, guaranteed-valid small PNG shipped with Playwright itself (its
 *  own Chromium app icon) — avoids the risk of a hand-built/base64'd image
 *  being malformed and rendering as a broken icon on camera. */
const DEMO_IMAGE_PATH = path.join(
  require.resolve("playwright-core/package.json"),
  "..",
  "lib/server/chromium/appIcon.png",
);

/** Returns the .card block containing a given question's prompt text — every
 *  question, on both the builder canvas and the live participant forms,
 *  renders inside its own .card, so scoping by prompt substring reliably
 *  isolates one question's controls from all the others on the page. */
function questionCard(page: Page, promptSubstring: string): Locator {
  return page.locator(".card", { hasText: promptSubstring });
}

/**
 * The admin inspector's prompt/help/media-type/config fields all carry
 * stable ids (#q-prompt, #q-help, #q-media-type, #q-<field>) — and because
 * only one question can be selected at a time, each id is unique in the DOM
 * regardless of how many questions exist on the canvas. Only the per-option
 * label inputs have no id at all, so `input.input:not([id])` isolates them.
 */
async function setOptionLabels(page: Page, labels: string[]) {
  const optionInputs = page.locator("input.input:not([id])");
  let count = await optionInputs.count();
  while (count < labels.length) {
    await page.getByRole("button", { name: "+ Add option" }).click();
    count = await optionInputs.count();
  }
  for (let i = 0; i < labels.length; i++) {
    await optionInputs.nth(i).fill(labels[i]);
  }
}

async function addQuestion(page: Page, typeLabel: string) {
  await page.getByRole("button", { name: typeLabel, exact: false }).first().click();
}

test("survey system — pre-event, post-event, admin customization & console tour", async ({
  page,
}) => {
  test.setTimeout(2_400_000);

  await page.goto("/");
  await titleCard(page, "Surveys — pre-event and post-event", "Live·En·Synergy");
  await beat(page, 900);

  // =========================================================================
  // 1. ADMIN — building a pre-event public survey, full customization tour
  // =========================================================================
  await titleCard(page, "Building a pre-event survey", "1 of 8 — every customization option");
  await signIn(page, ADMIN);

  await page.goto("/dashboard/admin/surveys/new");
  await page.locator("#title").fill("Sakshi Live — Full Fan Survey");
  await page.locator("#campaign_id").selectOption(CMP_2);
  await page.locator('input[name="is_public"]').check();
  await page
    .locator("#intro_message")
    .fill("Two minutes, no account needed — tell us what would make this the best gig ever.");
  await page
    .locator("#thank_you_message")
    .fill("Amazing — thank you! Join the community below to unlock rewards and register.");
  await caption(
    page,
    "Public toggle, intro and thank-you copy",
    "The three fields that turn a normal survey into a link anyone can answer, with the copy that frames it.",
  );
  await beat(page, 2600);
  await page.getByRole("button", { name: "Create survey" }).click();
  await page.waitForURL(/\/dashboard\/admin\/surveys\/[0-9a-f-]{36}$/);
  const preEventId = page.url().split("/").pop()!;
  await beat(page, 800);

  await caption(
    page,
    "Every question type in the palette",
    "Single/multiple choice, scale, yes/no, dropdown, short/long text, ranking, number, attention check, hidden field.",
  );
  await beat(page, 2400);

  // Q1 — single choice + image media
  await addQuestion(page, "Single choice");
  await page.locator("#q-prompt").fill("How excited are you to see Sakshi live?");
  await setOptionLabels(page, ["Very excited", "Somewhat excited", "Not sure yet"]);
  await page.locator("#q-media-type").selectOption("image");
  await page.locator('input[type="file"]').setInputFiles(DEMO_IMAGE_PATH);
  await expect(page.locator('img[src*="supabase"]')).toBeVisible({ timeout: 15_000 });
  await caption(page, "Image upload on a question", "Goes straight into the media bucket, same as a profile photo.");
  await beat(page, 2400);

  // Q2 — multiple choice + min/max select
  await addQuestion(page, "Multiple choice");
  await page.locator("#q-prompt").fill("Which of these matter most when you go to a gig?");
  await setOptionLabels(page, ["Sound quality", "Meeting other fans", "Merch", "Getting a good spot"]);
  await page.locator("#q-min_select").fill("1");
  await page.locator("#q-max_select").fill("2");
  await beat(page, 1000);

  // Q3 — scale with custom end labels
  await addQuestion(page, "Rating / scale");
  await page.locator("#q-prompt").fill("How likely are you to recommend Sakshi's shows to a friend?");
  await page.locator("#q-min_label").fill("Not likely");
  await page.locator("#q-max_label").fill("Extremely likely");
  await caption(page, "Per-type config", "Scale range and end labels, min/max selections, max length — each type exposes what it needs.");
  await beat(page, 2400);

  // Q4 / Q5 — yes/no pair for a contradiction rule
  await addQuestion(page, "Yes / No");
  await page.locator("#q-prompt").fill("Have you been to a Sakshi show before?");
  await beat(page, 500);
  await addQuestion(page, "Yes / No");
  await page.locator("#q-prompt").fill("Is this the first time you've heard of Sakshi?");
  await beat(page, 800);

  // Q6 — dropdown
  await addQuestion(page, "Dropdown");
  await page.locator("#q-prompt").fill("Which city are you most likely to attend from?");
  await setOptionLabels(page, ["Manchester", "London", "Leeds", "Other"]);
  await beat(page, 800);

  // Q7 — short text with max length
  await addQuestion(page, "Short text");
  await page.locator("#q-prompt").fill("In one line, what would make this the best gig ever?");
  await page.locator("#q-max_length").fill("120");
  await beat(page, 800);

  // Q8 — long text + video embed media
  await addQuestion(page, "Long text");
  await page.locator("#q-prompt").fill("Tell us about your favourite Sakshi memory");
  await page.locator("#q-media-type").selectOption("video");
  await page.locator('input[type="url"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await caption(page, "Video embed on a question", "A link, not an upload — YouTube/Vimeo/Loom only, kept off the media bucket for performance.");
  await beat(page, 2400);

  // Q9 — ranking
  await addQuestion(page, "Ranking");
  await page.locator("#q-prompt").fill("Rank these by how much they'd sway your decision to come");
  await setOptionLabels(page, ["Ticket price", "Lineup", "Venue", "Date/time"]);
  await beat(page, 800);

  // Q10 — number/slider
  await addQuestion(page, "Number / slider");
  await page.locator("#q-prompt").fill("How many gigs have you been to this year?");
  await page.locator("#q-min").fill("0");
  await page.locator("#q-max").fill("50");
  await beat(page, 800);

  // Q11 — attention check
  await addQuestion(page, "Attention check");
  await page.locator("#q-prompt").fill("To show you're reading carefully, please select 'Blue'.");
  await setOptionLabels(page, ["Red", "Blue", "Green"]);
  await page.locator("#q-expected_answer").fill("blue");
  await caption(page, "Attention check", "Scored by the quality engine, never shown to the brand — this is how a careless or bot response gets caught.");
  await beat(page, 2400);

  // Q12 — hidden field
  await addQuestion(page, "Hidden / system field");
  await page.locator("#q-profile_field").selectOption("profiles.email");
  await caption(page, "Hidden field", "Never rendered — silently pulled from a signed-in respondent's own profile. Public respondents skip it entirely.");
  await beat(page, 2400);

  // Contradiction rule between the two yes/no questions
  const ruleCard = page.locator(".card", { hasText: "Contradiction rules" });
  await ruleCard.scrollIntoViewIfNeeded();
  await ruleCard.getByRole("button", { name: "+ Add rule" }).click();
  const qaSelect = ruleCard.locator("select").nth(0);
  const qaValue = await qaSelect.locator("option", { hasText: "Have you been to a Sakshi show before" }).getAttribute("value");
  await qaSelect.selectOption(qaValue!);
  await ruleCard.locator("select").nth(1).selectOption({ label: "Yes" });
  const qbSelect = ruleCard.locator("select").nth(2);
  const qbValue = await qbSelect.locator("option", { hasText: "Is this the first time" }).getAttribute("value");
  await qbSelect.selectOption(qbValue!);
  await ruleCard.locator("select").nth(3).selectOption({ label: "Yes" });
  await caption(page, "Contradiction rules", "\"Been before\" and \"first time hearing of them\" can't both be true — this pair now feeds the quality engine's contradictions signal.");
  await beat(page, 3000);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await beat(page, 800);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish to edit" })).toBeVisible({ timeout: 15_000 });
  await beat(page, 800);

  await caption(page, "Live: the event context, and the public link", "Resolved through the campaign, and copyable straight from here.");
  await beat(page, 2800);

  // =========================================================================
  // 2. PUBLIC — answering it as a stranger with no account
  // =========================================================================
  await titleCard(page, "Answering it — no account needed", "2 of 8");
  await signOut(page);
  await page.goto(`/survey/${preEventId}`);
  await beat(page, 800);
  await caption(page, "About you", "Name, email, phone, a rough age range, residency and consent — captured once, up front.");
  await beat(page, 2600);

  await page.locator("#first_name").fill("Alex");
  await page.locator("#last_name").fill("Rivers");
  await page.locator("#email").fill(`alex.rivers.${Date.now()}@example.org`);
  await page.locator("#phone").fill("7911223344");
  await page.locator("#age_range").selectOption("25-34");
  await page.locator('input[name="residency_confirmed"]').check();
  await page.locator('input[name="consent_accepted"]').check();
  await beat(page, 800);

  const q1 = questionCard(page, "How excited are you to see Sakshi live?");
  await q1.scrollIntoViewIfNeeded();
  await caption(page, "The uploaded image, live on the question", "");
  await beat(page, 1800);
  await q1.getByLabel("Very excited").check();

  await questionCard(page, "Which of these matter most").getByLabel("Sound quality").check();
  await questionCard(page, "Which of these matter most").getByLabel("Getting a good spot").check();

  const q3 = questionCard(page, "How likely are you to recommend Sakshi's shows");
  await q3.getByLabel("4", { exact: true }).check();

  await questionCard(page, "Have you been to a Sakshi show before?").getByLabel("No").check();
  await questionCard(page, "Is this the first time you've heard of Sakshi?").getByLabel("Yes").check();

  await questionCard(page, "Which city are you most likely").locator("select").selectOption({ label: "Manchester" });

  await questionCard(page, "what would make this the best gig ever?").locator("input.input").fill("An unannounced acoustic encore.");

  const q8 = questionCard(page, "Tell us about your favourite Sakshi memory");
  await q8.scrollIntoViewIfNeeded();
  await caption(page, "And the embedded video, on another", "");
  await beat(page, 1800);
  await q8.locator("textarea.textarea").fill("Front row at her very first UK headline show.");

  await questionCard(page, "How many gigs have you been to this year?").locator('input[type="number"]').fill("12");
  await questionCard(page, "please select 'Blue'").getByLabel("Blue").check();

  await beat(page, 800);
  await page.getByRole("button", { name: "Submit survey" }).click();
  await expect(page.getByText("Thanks for taking part!")).toBeVisible({ timeout: 20_000 });
  await caption(page, "The CTA — join the community, register for the event", "The link carries the event's own reference through to sign-up.");
  await beat(page, 3200);

  // =========================================================================
  // 3. Creating an account from the CTA
  // =========================================================================
  await titleCard(page, "Creating an account from the CTA", "3 of 8");
  await page.getByRole("link", { name: /Create your account/ }).click();
  await page.waitForURL(/\/auth\/sign-up/);
  await caption(page, "Role and event both pre-set from the link", "");
  await beat(page, 2200);
  await page.locator("#fullName").fill("Priya Fan");
  await page.locator("#email").fill(`priya.fan.${Date.now()}@gmail.com`);
  await page.locator("#password").fill("TestPass123!");
  await page.locator('input[name="terms_accepted"]').check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Check your inbox/)).toBeVisible({ timeout: 20_000 });
  await caption(page, "Real account, real metadata", "The event reference is already attached — once they confirm and finish onboarding:");
  await beat(page, 3200);

  // =========================================================================
  // 4. Landing already registered (pre-confirmed demo account picks up here)
  // =========================================================================
  await titleCard(page, "Landing already registered", "4 of 8");
  await signIn(page, ONBOARDING_DEMO);
  await page.waitForURL(/\/onboarding\/audience/);
  await page.locator("#full_name").fill("Jordan Rivers");
  await page.locator("#phone").fill("7911667788");
  await page.getByRole("button", { name: "Finish & explore events" }).click();
  await page.waitForURL(/\/dashboard\/participations/, { timeout: 20_000 });
  await caption(page, "Onboarding finished — already registered", "No extra click. The participation was created the moment onboarding completed.");
  await beat(page, 3200);

  // =========================================================================
  // 5. ADMIN — building a post-event survey
  // =========================================================================
  await titleCard(page, "Building a post-event survey", "5 of 8");
  await signOut(page);
  await signIn(page, ADMIN);
  await page.goto("/dashboard/admin/surveys/new");
  await page.locator("#title").fill("Late-Shift Sessions — Post-Show Feedback");
  await page.locator("#kind").selectOption("post_event");
  await caption(page, "No public toggle here", "Post-event surveys stay attendee-only by design — gone the moment the kind is switched.");
  await beat(page, 2400);
  await page.locator("#campaign_id").selectOption(CMP_1);
  await page.getByRole("button", { name: "Create survey" }).click();
  await page.waitForURL(/\/dashboard\/admin\/surveys\/[0-9a-f-]{36}$/);
  const postEventId = page.url().split("/").pop()!;
  await beat(page, 600);

  await addQuestion(page, "Rating / scale");
  await page.locator("#q-prompt").fill("How likely are you to recommend this event to a friend?");
  await page.locator("#q-min").fill("1");
  await page.locator("#q-max").fill("10");
  await beat(page, 800);

  await addQuestion(page, "Single choice");
  await page.locator("#q-prompt").fill("How would you rate the sound and production?");
  await setOptionLabels(page, ["Excellent", "Good", "Average", "Poor"]);
  await beat(page, 800);

  await addQuestion(page, "Long text");
  await page.locator("#q-prompt").fill("Any feedback for the artist or organisers?");
  await beat(page, 800);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("button", { name: "Unpublish to edit" })).toBeVisible({ timeout: 15_000 });
  await beat(page, 1200);

  // =========================================================================
  // 6. Taking the post-event survey as a verified attendee
  // =========================================================================
  await titleCard(page, "Taking it as a verified attendee", "6 of 8");
  await signOut(page);
  await signIn(page, ATTENDEE);
  await page.goto(`/dashboard/surveys/${postEventId}`);
  await caption(page, "Attendee-only, unlocked by a verified check-in", "This account already has attendance verified for this event — that's the whole gate.");
  await beat(page, 2600);

  await questionCard(page, "How likely are you to recommend this event to a friend?").getByLabel("9", { exact: true }).check();
  await questionCard(page, "How would you rate the sound and production?").getByLabel("Excellent").check();
  await questionCard(page, "Any feedback for the artist or organisers?").locator("textarea.textarea").fill("Best sound I've heard at that venue — more of this please.");
  await page.getByRole("button", { name: "Submit survey" }).click();
  await page.waitForURL(/\/dashboard\/participations/, { timeout: 20_000 });
  await caption(page, "Recorded, and tied straight to reward release", "");
  await beat(page, 2600);

  // =========================================================================
  // 7. Where this ties back into rewards
  // =========================================================================
  await titleCard(page, "Where surveys tie back into rewards", "7 of 8");
  await signOut(page);
  await signIn(page, ADMIN);
  await page.goto("/dashboard/admin/events/sponsored/84ab36b5-f132-45f9-a397-c77f3611826e");
  await caption(page, "Reward engine, survey gate, proofs, invoicing — one screen", "A reward can't release until the gated survey response passes the quality engine.");
  await beat(page, 3600);

  // =========================================================================
  // 8. The rest of the admin console
  // =========================================================================
  await titleCard(page, "The rest of the admin console", "8 of 8");

  await page.goto("/dashboard/admin/campaigns");
  await caption(page, "Campaigns", "Every sponsorship request from a brand, matched status at a glance.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/campaigns/intake");
  await caption(page, "Campaign requests", "Brand-submitted intake, waiting to become a real campaign — admin decides what goes live.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/events");
  await caption(page, "Events", "Every listing and confirmed sponsorship deal on the platform.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/participants");
  await caption(page, "Participants", "Every registration across every sponsored event, with total rewarded to date.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/packages");
  await caption(page, "Packages", "The campaign pricing tiers and the platform margin each one carries.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/notifications");
  await caption(page, "Notification setup", "Every event the platform can notify on — toggle channels, edit the wording, preview it.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/notifications/outbox");
  await caption(page, "Email outbox", "The audit trail of every email the platform has queued to send.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/invoices");
  await caption(page, "Invoices", "Sponsor invoices — bank transfer against a reference, no on-platform payment collection.");
  await beat(page, 2000);

  await page.goto("/dashboard/admin/users");
  await caption(page, "Users", "Search, filter and manage every account on the platform.");
  await beat(page, 2000);

  await titleCard(page, "That's the platform, end to end", "Live·En·Synergy");
  await beat(page, 1200);
});
