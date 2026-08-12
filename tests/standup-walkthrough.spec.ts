import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "./helpers";
import { beat, caption, signIn, signOut, titleCard } from "./walkthrough-kit";

/**
 * Walkthrough recording of everything the 3 Aug standup changed, across all
 * four roles, as one continuous video.
 *
 * Deliberately **read-only**. It opens the confirmation dialogs and cancels
 * them, types into the admin budget field to show the fee recalculating and
 * then navigates away without saving, and opens the feedback widget without
 * submitting. Running it twice leaves the database exactly as it found it —
 * which matters, because it points at the same Supabase project the live site
 * uses (see docs/qa-creds.md).
 *
 * It leans on fixtures that already exist in the dev data rather than creating
 * its own, so the numbers on screen are real:
 *   · CMP-00003 — a campaign settled from four suggested events
 *   · SPE-00002 — £8,000 gross, confirmed, with a deadline in the past
 *   · SPE-00001 — completed, two named participants
 *   · Priya Shah — an audience member at every step of the tracker
 *
 * Recorded by the `standup-video` project in playwright.config.ts:
 *   npx playwright test --project=standup-video
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };
const AUDIENCE = { email: "audience.tester@example.com", password: "TestPass123!" };

/** Events used by the walkthrough — see the note above. */
const EVENT = {
  completedWithParticipants: "84ab36b5-f132-45f9-a397-c77f3611826e", // SPE-00001
  confirmedWithBudget: "6d0a05d6-129a-445b-8c12-73a38238e91c", // SPE-00002
};

test("3 Aug standup — walkthrough of every change", async ({ page }) => {
  test.setTimeout(600_000);

  // ---- Opening card -------------------------------------------------------
  await page.goto("/");
  await titleCard(
    page,
    "What changed after the 3 Aug standup",
    "Live·En·Synergy",
  );
  await beat(page, 900);

  // ---- 1. Sign-up: merged role + per-party terms ---------------------------
  await titleCard(page, "Sign-up", "1 of 6");
  await page.goto("/auth/sign-up");
  await caption(
    page,
    "Artist and Event Organiser are now one category",
    "Three cards instead of four — organisers sign up under Artist, which has identical nav and permissions.",
  );
  await beat(page, 3200);

  // `?role=` jumps straight to step 2, which is where the per-party terms
  // live. Deliberately not driving the card → Continue interaction: this is a
  // recording, and the point is the wording, not the click path.
  await page.goto("/auth/sign-up?role=artist");
  await page.mouse.wheel(0, 420);
  await caption(
    page,
    "Terms are agreed per party",
    "A brand, an artist and an audience member commit to different things — the summary and the checkbox change with the role.",
  );
  await beat(page, 4200);

  await page.goto("/auth/sign-up?role=audience");
  await page.mouse.wheel(0, 420);
  await caption(
    page,
    "The audience version of the same agreement",
    "One account per person · rewards only after verification · details never sold.",
  );
  await beat(page, 4200);

  // ---- 2. Audience ---------------------------------------------------------
  await titleCard(page, "Audience portal", "2 of 6");
  await signIn(page, AUDIENCE);
  await beat(page, 1200);

  await caption(
    page,
    "Step tracker on the overview",
    "Registered → Selected → Ticket uploaded → Attended → Reward released, full width at the foot of the page.",
  );
  await page.mouse.wheel(0, 700);
  await beat(page, 3800);

  await caption(
    page,
    "…including the ticket they uploaded",
    "Previously there was no way to tell whether an upload had landed.",
  );
  await beat(page, 3000);

  await page.goto("/dashboard/profile");
  await page.mouse.wheel(0, 340);
  await caption(
    page,
    "Gender, with an option to self-describe",
    "Standard options plus a free-text box, stored separately so the standard answers stay countable.",
  );
  await beat(page, 3400);

  await caption(
    page,
    "Country of residence is a searchable dropdown",
    "Type to filter ~195 countries. Was a free-text box, which produced too many spellings to filter on.",
  );
  const country = page.locator('input[name="country_of_residence"]');
  await country.click();
  await country.fill("");
  await country.type("uni", { delay: 220 });
  await beat(page, 3200);
  await page.keyboard.press("Escape");

  await caption(
    page,
    "Saving a profile asks first",
    "And the page warns you if you navigate away with unsaved edits.",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await beat(page, 3400);
  await page.getByRole("button", { name: "Go back" }).click(); // read-only: cancel
  await beat(page, 900);

  await caption(
    page,
    "Feedback tab on every page",
    "Opens the report form; each submission gets a reference and can raise a GitHub issue.",
  );
  await page.getByRole("button", { name: /Feedback/ }).click();
  await beat(page, 3400);
  await page.keyboard.press("Escape");
  await signOut(page);

  // ---- 3. Brand: the budget fix -------------------------------------------
  await titleCard(page, "The budget fix", "3 of 6");
  await signIn(page, ACCOUNTS.brand);
  await page.goto(`/dashboard/sponsored/${EVENT.completedWithParticipants}`);
  await beat(page, 1000);
  await caption(
    page,
    "Budgets now show what's actually payable",
    "Every 'remaining budget' used to quote the gross figure — overstating it by the whole service fee. £4,000 gross · £432 fee · £3,568 for rewards.",
  );
  await beat(page, 4200);

  await page.mouse.wheel(0, 2600);
  await caption(
    page,
    "Reward release is admin-only now",
    "No amount box, no release button — and the brand's server action has no release branch at all, so a hand-crafted request does nothing either.",
  );
  await beat(page, 4000);

  await caption(
    page,
    "…and participants show real names",
    "This list could only ever show 'Participant #3f9a1c0b' before.",
  );
  await beat(page, 3200);
  await signOut(page);

  // ---- 4. Admin: campaigns -------------------------------------------------
  await titleCard(page, "Admin — campaigns", "4 of 6");
  await signIn(page, ADMIN);
  await page.goto("/dashboard/admin/campaigns?status=closed");
  await beat(page, 1200);
  await caption(
    page,
    "Several events can be suggested for one campaign",
    "The team puts two or three options in front of a sponsor. The one they accepted is ticked; the rest were withdrawn automatically and their listings went back on the market.",
  );
  await beat(page, 4600);

  // ---- 5. Admin: editing a live deal ---------------------------------------
  await titleCard(page, "Admin — editing a live deal", "5 of 6");
  await page.goto(`/dashboard/admin/events/sponsored/${EVENT.confirmedWithBudget}`);
  await beat(page, 1000);
  await caption(
    page,
    "Status only ever moves forward",
    "A confirmed deal can't drop back to in-progress — the picker won't offer it, and the server refuses it even if the request is forged.",
  );
  await page.mouse.wheel(0, 520);
  await beat(page, 4000);

  const budget = page.locator("#edit-budget");
  await budget.scrollIntoViewIfNeeded();
  await caption(
    page,
    "Admin can edit a deal the parties can't",
    "Including a participation deadline that has already passed — the case Sakshi was blocked on.",
  );
  await beat(page, 3800);

  await caption(
    page,
    "Changing the budget re-derives what's left",
    "Net of the fee, less anything already paid out.",
  );
  await budget.fill("");
  await budget.type("12000", { delay: 260 });
  await beat(page, 3600);

  // Read-only: navigate away rather than saving.
  await page.goto("/dashboard/admin/participants");
  await beat(page, 900);
  await caption(
    page,
    "CSV export reads properly in a spreadsheet",
    "Dates as DD/MM/YYYY HH:mm instead of raw timestamps, plus gender and country columns.",
  );
  await beat(page, 3600);

  // ---- 6. Conflict handling ------------------------------------------------
  await titleCard(page, "One event, one sponsor", "6 of 6");
  await page.goto("/dashboard/admin/campaigns?status=closed");
  await caption(
    page,
    "Accepting is now atomic",
    "Two people accepting rival proposals at the same moment could both have confirmed — one campaign, one budget, two live sponsorships. It's settled in a single locked transaction now, with database constraints making the double-booking impossible.",
  );
  await beat(page, 5200);

  await titleCard(
    page,
    "19 of 24 items done · 2 waiting on input",
    "3 Aug standup",
  );

  // A sanity assertion so a broken run fails rather than quietly recording junk.
  await expect(page).toHaveURL(/\/dashboard\/admin\/campaigns/);
});
