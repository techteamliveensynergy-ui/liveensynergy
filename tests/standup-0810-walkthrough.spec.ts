import { test, expect } from "@playwright/test";
import { ACCOUNTS } from "./helpers";
import { beat, caption, signIn, signOut, titleCard } from "./walkthrough-kit";

/**
 * Walkthrough recording of everything the 10 Aug standup changed, plus the
 * defects that verifying it turned up, as one continuous video.
 *
 * Deliberately **read-only**, like the 3 Aug recording: it opens the draw
 * panel without running it, opens the new-chat picker without starting a
 * thread, and reads the feedback inbox rather than submitting to it. Running
 * it twice leaves the data exactly as it found it — which matters, because it
 * points at the same Supabase project the live site uses.
 *
 * It leans on fixtures already in the data so the numbers on screen are real:
 *   · SPE-00003 — confirmed, participants, a linked listing with a ticket price
 *   · CMP-00001 — Northwave Coffee's campaign, carrying a suggested event
 *   · FB-00002…FB-00009 — the client's own reports from 7–8 Aug
 *
 * Recorded by the `s0810-video` project in playwright.config.ts:
 *   npx playwright test --project=s0810-video
 * Points at the deployed site by default; WALKTHROUGH_URL overrides.
 */

const ADMIN = { email: "admin.tester@example.com", password: "TestPass123!" };
const AUDIENCE = {
  email: "audience.tester@example.com",
  password: "TestPass123!",
};

test("10 Aug standup — walkthrough of every change", async ({ page }) => {
  test.setTimeout(900_000);

  await page.goto("/");
  await titleCard(
    page,
    "What changed after the 10 Aug standup",
    "Live·En·Synergy",
  );
  await beat(page, 900);

  // ---- 1. Admin: the event details that weren't there ----------------------
  await titleCard(page, "Editing an event", "1 of 8");
  await signIn(page, ADMIN);

  await page.goto("/dashboard/admin/events");
  await beat(page, 900);
  const event = page
    .locator('a[href^="/dashboard/admin/events/sponsored/"]')
    .first();
  await event.click();
  await page.waitForURL(/\/dashboard\/admin\/events\/sponsored\//);
  await caption(
    page,
    "Ticket price and capacity are visible, and editable",
    "Neither was on this screen before — they live on the event listing, so the admin form now writes them through to it. The ticket price is what “people this can sponsor” divides by.",
  );
  await beat(page, 4200);

  // ---- 2. Selection is a draw, not a choice --------------------------------
  await titleCard(page, "Selection is a random draw", "2 of 8");
  await page.goto("/dashboard/admin/events");
  const drawEvent = page
    .locator('a[href^="/dashboard/admin/events/sponsored/"]')
    .first();
  await drawEvent.click();
  await page.waitForURL(/\/dashboard\/admin\/events\/sponsored\//);
  await page
    .locator(".card:has-text('Participants')")
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await caption(
    page,
    "The brand and the artist can no longer pick names",
    "Select and Reject are gone from their page — and from their server action, so a hand-crafted request does nothing either. The team runs a random draw here instead. Anyone not drawn stays in the pool for the next round.",
  );
  await beat(page, 5200);

  // ---- 3. Chat you can actually read ---------------------------------------
  await titleCard(page, "Reading a conversation", "3 of 8");
  await page.goto("/dashboard/messages");
  await beat(page, 1200);
  await caption(
    page,
    "Threads are named by the act and the brand",
    "Two threads with the same title used to be indistinguishable. Each is now labelled with both parties — and the list shows when it was last active.",
  );
  await beat(page, 4000);

  const thread = page.locator('a[href^="/dashboard/messages?c="]').first();
  if (await thread.count()) {
    await thread.click();
    await page.waitForURL(/\?c=/);
    await beat(page, 1000);
    await caption(
      page,
      "Every message says who sent it, and when",
      "Reading someone else's thread, nothing was “mine”, so every message looked identical. Now the two sides sit opposite each other, captioned with the sender — with a date heading per day and a time on each message.",
    );
    await beat(page, 5200);
  }

  // ---- 4. Admin can start the conversation ---------------------------------
  await titleCard(page, "Starting a conversation", "4 of 8");
  await page.goto("/dashboard/messages");
  const newChat = page.getByRole("button", {
    name: /New chat with an artist or sponsor/i,
  });
  if (await newChat.count()) {
    await newChat.click();
    await beat(page, 1200);
    await caption(
      page,
      "The team can now write first",
      "Admins could only ever reply to a thread somebody else had started. The picker names people by their act or brand — “Northwave Coffee”, not “Brand Tester” — because that's how the team refers to them.",
    );
    await beat(page, 5000);
  }

  // ---- 5. Feedback: reports the team could not see -------------------------
  await titleCard(page, "The feedback inbox", "5 of 8");
  await page.goto("/dashboard/admin/feedback");
  await beat(page, 1400);
  await caption(
    page,
    "Every report was saved. None of them were visible.",
    "The query embedded `profiles`, which this table points at twice — who reported it, and who resolved it. PostgREST refused to guess, the query errored, and the page rendered “Nothing reported” over a table holding fourteen. Eight are your own reports from 7–8 August.",
  );
  await beat(page, 6000);
  await caption(
    page,
    "Now: who reported it, their email, and the screenshot",
    "The image renders in place rather than hiding behind a link, and opens full size in a new tab. “Message …” opens a thread with the reporter — also in a new tab, reusing the existing one if there is any.",
  );
  await beat(page, 5600);

  // ---- 6. Enquiries carry their reference ----------------------------------
  await titleCard(page, "Enquiries", "6 of 8");
  await page.goto("/dashboard/admin/enquiries");
  await beat(page, 1200);
  await caption(
    page,
    "An enquiry now says what it's about",
    "Opened from a sponsorship, the contact form carries the reference and the sender's details, and opens in a new tab so you keep the page you were on. The inbox shows that reference, and can reply in-app.",
  );
  await beat(page, 5000);

  // ---- 7. Notifications that name the thing --------------------------------
  await titleCard(page, "Notifications", "7 of 8");
  await page.goto("/dashboard/notifications");
  await beat(page, 1200);
  await caption(
    page,
    "Each one quotes its reference",
    "“New feedback report” with no number became “New feedback report FB-00012”, with the reporter and the title. Fourteen templates rewritten — and any you'd edited by hand were left alone.",
  );
  await beat(page, 5000);

  // ---- 8. What the brand can and can't see ---------------------------------
  await titleCard(page, "One brand, one list", "8 of 8");
  await signOut(page);
  await signIn(page, ACCOUNTS.brand);
  await page.goto("/dashboard/sponsored");
  await beat(page, 1200);
  await caption(
    page,
    "A brand sees its own sponsorships — and only its own",
    "Found while testing: this page trusted the database to filter, but the policy that lets the audience discover confirmed events applies to brands too. Northwave Coffee's list was showing a rival's deals, budgets and remaining reward pools.",
  );
  await beat(page, 6000);

  await page.goto("/dashboard/campaigns");
  await beat(page, 1000);
  await caption(
    page,
    "Sponsors can suggest an event of their own",
    "A brief captured the kind of event you wanted, never “this one, here”. The suggestion reaches the artist in the chat — when the team matches the campaign, or straight away if it's already matched.",
  );
  await beat(page, 5200);

  // ---- Audience -------------------------------------------------------------
  await signOut(page);
  await signIn(page, AUDIENCE);
  await page.goto("/dashboard/participations");
  await beat(page, 1200);
  await caption(
    page,
    "Once you're selected, you can't withdraw",
    "The reward is earmarked and the organiser is counting on the headcount, so it's a conversation with the team rather than a button. Enforced on the server too, not just hidden.",
  );
  await beat(page, 5200);

  await titleCard(
    page,
    "11 of 14 items done · 7 defects found and fixed",
    "10 Aug standup",
  );

  // Sanity assertion, so a broken run fails rather than quietly recording junk.
  await expect(page).toHaveURL(/\/dashboard\/participations/);
});
