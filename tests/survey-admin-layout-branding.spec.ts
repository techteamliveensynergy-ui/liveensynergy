import path from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { beat, caption, signIn, titleCard } from "./walkthrough-kit";

/**
 * Survey-admin-only walkthrough of the layout/branding customization added in
 * migration 0038: single-page vs step-by-step layout, a template-level cover
 * image/video (single-page only) vs per-question media (step-by-step only),
 * footer branding, and a custom accent colour on the Next/Submit button.
 *
 * Deliberately scoped to the survey admin screens — the builder, its preview,
 * and the two layout modes' rendering — and nothing else. The wider admin
 * console and the participant-facing pre/post-event flows are already
 * covered by `full-survey-walkthrough.spec.ts`; this one doesn't repeat them.
 *
 * Runs against a local build only (this feature isn't deployed yet):
 *   npm run build && PORT=3010 NEXT_PUBLIC_SITE_URL=http://localhost:3010 npm run start
 *   WALKTHROUGH_URL=http://localhost:3010 npx playwright test --project=survey-admin-video
 *
 * Not read-only: creates one real (draft, unpublished) survey template each
 * run, via the admin's own account. Never published, so it never becomes
 * reachable on the public /survey/ route.
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };

/** A real, guaranteed-valid small PNG shipped with Playwright itself (its own
 *  Chromium app icon) — avoids the risk of a hand-built/base64'd image being
 *  malformed and rendering as a broken icon on camera. */
const DEMO_IMAGE_PATH = path.join(
  require.resolve("playwright-core/package.json"),
  "..",
  "lib/server/chromium/appIcon.png",
);

const COVER_VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

/** Every question, on both the builder canvas and the live/preview forms,
 *  renders inside its own .card, so scoping by prompt substring reliably
 *  isolates one question's controls from all the others on the page. */
function questionCard(page: Page, promptSubstring: string): Locator {
  return page.locator(".card", { hasText: promptSubstring });
}

async function addQuestion(page: Page, typeLabel: string) {
  await page.getByRole("button", { name: typeLabel, exact: false }).first().click();
}

async function setOptionLabels(page: Page, labels: string[]) {
  // :not([type="url"]) excludes the (possibly DOM-present-but-hidden) cover
  // media video-URL field, which also has class="input" and no id — the
  // survey-details <details> panel keeps its children in the DOM even
  // collapsed, so a plain `input.input:not([id])` locator can resolve to it.
  const optionInputs = page.locator('input.input:not([id]):not([type="url"])');
  let count = await optionInputs.count();
  while (count < labels.length) {
    await page.getByRole("button", { name: "+ Add option" }).click();
    count = await optionInputs.count();
  }
  for (let i = 0; i < labels.length; i++) {
    await optionInputs.nth(i).fill(labels[i]);
  }
}

test("survey admin — layout modes, cover vs per-question media, footer branding, accent colour", async ({
  page,
}) => {
  test.setTimeout(1_200_000);

  await page.goto("/");
  await titleCard(page, "Survey layout & branding", "Admin builder — one-page vs step-by-step");
  await beat(page, 900);

  await signIn(page, ADMIN);

  // ===========================================================================
  // 1. Creating a survey, single-page layout with a cover video
  // ===========================================================================
  await titleCard(page, "Single page — one cover image or video", "1 of 3");
  await page.goto("/dashboard/admin/surveys/new");
  await page.locator("#title").fill("Autumn Fan Pulse");
  await beat(page, 600);

  await page.locator("h2", { hasText: "Layout & branding" }).scrollIntoViewIfNeeded();
  await caption(
    page,
    "Layout & branding — new, admin-configurable",
    "Single page (today's behaviour) or step-by-step, Typeform-style — chosen right here at creation time.",
  );
  await beat(page, 2600);

  // Layout defaults to single_page — leave it, and set a cover video.
  await page.locator("#cover_media_type").selectOption("video");
  await page.locator('input[type="url"]').fill(COVER_VIDEO_URL);
  await caption(
    page,
    "One cover image or video for the whole survey",
    "Single-page reads as one long form, so a single hero image/video at the top — not one per question.",
  );
  await beat(page, 2600);

  await page.locator("#footer_brand_name").fill("Live En Synergy");
  await page.locator("#footer_tagline").fill("Sponsorship, re-imagined");
  const accentInput = page.locator("#accent_color");
  await accentInput.fill("#7c3aed");
  await caption(
    page,
    "Footer branding and a custom button colour",
    "Company name + tagline at the bottom of every page/step; the accent colour applies to Next/Submit only — Back stays neutral.",
  );
  await beat(page, 2800);

  await page.getByRole("button", { name: "Create survey" }).click();
  await page.waitForURL(/\/dashboard\/admin\/surveys\/[0-9a-f-]{36}$/);
  const templateId = page.url().split("/").pop()!;
  await beat(page, 800);

  // One question — the inspector should steer media toward the template's
  // own cover instead of offering a per-question field, since we're still
  // in single-page mode.
  await addQuestion(page, "Single choice");
  await page.locator("#q-prompt").fill("How excited are you for the autumn run of shows?");
  await setOptionLabels(page, ["Very excited", "Somewhat excited", "Not sure yet"]);
  await beat(page, 600);

  const mediaHint = page.getByText("Per-question media is only available in step-by-step layout");
  await mediaHint.scrollIntoViewIfNeeded();
  await caption(
    page,
    "No per-question media field here",
    "Single-page mode points the admin back to the cover image/video above instead — one media slot, not eleven.",
  );
  await beat(page, 2800);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await beat(page, 800);

  // Preview — see the cover video, the question, the footer and the accent colour.
  await page.getByRole("link", { name: "Preview" }).click();
  await page.waitForURL(/\/preview$/);
  await caption(page, "Preview: the cover video, live", "");
  await beat(page, 2200);
  await page.locator("iframe").scrollIntoViewIfNeeded();
  await beat(page, 1600);

  // SurveyFooter renders the brand name and tagline as separate <span>s with
  // no text node between them (the "·" spacing is CSS margin only) — the
  // concatenated text has no space around the separator, so match a
  // substring that doesn't depend on that spacing.
  const footerLocator = page.getByText("Sponsorship, re-imagined");
  await footerLocator.scrollIntoViewIfNeeded();
  const submitButton = page.getByRole("button", { name: "Finish preview" });
  await submitButton.scrollIntoViewIfNeeded();
  await caption(
    page,
    "Footer branding, and the custom button colour",
    "The purple here is #7c3aed, set on the template — Submit picks it up, no other button on the platform does.",
  );
  await beat(page, 3000);

  // ===========================================================================
  // 2. Switching to step-by-step — per-question media instead of a cover
  // ===========================================================================
  await titleCard(page, "Switching to step-by-step", "2 of 3");
  await page.goto(`/dashboard/admin/surveys/${templateId}`);
  await beat(page, 600);

  await page.locator("summary", { hasText: "Survey details" }).click();
  await beat(page, 400);
  await page.locator("#layout_mode").scrollIntoViewIfNeeded();
  await caption(
    page,
    "One toggle changes both the customization surface and the participant experience",
    "",
  );
  await beat(page, 2200);
  await page.locator("#layout_mode").selectOption("stepped");
  await beat(page, 1000);
  await expect(page.locator("#cover_media_type")).toHaveCount(0);
  await caption(
    page,
    "The cover-media field is gone",
    "Step-by-step shows one question per screen, so a single template-wide cover no longer makes sense — it's per-question media instead.",
  );
  await beat(page, 2800);

  await page.getByRole("button", { name: "Save details" }).click();
  await beat(page, 1000);

  // The existing question now offers per-question media. Select it on the
  // canvas via its "select" button specifically — a plain .card filter would
  // also match the inspector panel's own card on the right, which repeats
  // the same prompt text.
  const q1CanvasButton = page.getByRole("button", { name: /How excited are you for the autumn run/ });
  await q1CanvasButton.scrollIntoViewIfNeeded();
  await q1CanvasButton.click();
  await beat(page, 400);
  await page.locator("#q-media-type").scrollIntoViewIfNeeded();
  await caption(
    page,
    "Per-question media is back — a different image for each step",
    "",
  );
  await beat(page, 2400);
  await page.locator("#q-media-type").selectOption("image");
  await page.locator('input[type="file"]').setInputFiles(DEMO_IMAGE_PATH);
  await expect(page.locator('img[src*="supabase"]')).toBeVisible({ timeout: 15_000 });
  await beat(page, 1200);

  // Two more questions so the progress bar reads as more than one step.
  await addQuestion(page, "Yes / No");
  await page.locator("#q-prompt").fill("Have you been to one of our shows before?");
  await beat(page, 600);

  await addQuestion(page, "Long text");
  await page.locator("#q-prompt").fill("What would make this the best gig ever?");
  await beat(page, 600);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await beat(page, 800);

  // ===========================================================================
  // 3. Preview — Typeform-style stepping, back/forward, footer on every step
  // ===========================================================================
  await titleCard(page, "Step-by-step, live", "3 of 3");
  await page.getByRole("link", { name: "Preview" }).click();
  await page.waitForURL(/\/preview$/);
  await caption(page, "One question at a time, with a progress bar", "");
  await beat(page, 2400);

  await questionCard(page, "How excited are you for the autumn run").getByLabel("Very excited").check();
  await beat(page, 600);
  const nextButton = page.getByRole("button", { name: "Next" });
  await nextButton.scrollIntoViewIfNeeded();
  await caption(
    page,
    "Next picks up the accent colour too — Back stays neutral",
    "A scoped CSS override, not a global change — this purple never leaks into the rest of the app.",
  );
  await beat(page, 2800);
  await nextButton.click();
  await beat(page, 800);

  await questionCard(page, "Have you been to one of our shows before?").getByLabel("No").check();
  await page.getByRole("button", { name: "Next" }).click();
  await beat(page, 800);

  await questionCard(page, "What would make this the best gig ever?").locator("textarea.textarea").fill("A surprise acoustic set to close the night.");
  await beat(page, 600);

  // exact: true — a substring match on "Back" also matches the floating
  // "Feedback" widget button in the corner.
  await page.getByRole("button", { name: "Back", exact: true }).scrollIntoViewIfNeeded();
  await caption(page, "Back/forward, and the footer on every step", "");
  await beat(page, 2400);

  const finishButton = page.getByRole("button", { name: "Finish preview" });
  await finishButton.scrollIntoViewIfNeeded();
  await beat(page, 1600);
  await finishButton.click();
  await expect(page.getByText("Preview complete")).toBeVisible({ timeout: 15_000 });
  await beat(page, 2000);

  await titleCard(page, "All admin-configurable, per survey", "Live·En·Synergy");
  await beat(page, 1200);
});
