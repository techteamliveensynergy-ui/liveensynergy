# 8 November 2026 — what was done

Everything below is on branch `claude/zen-hopper-y4subp`, PR #98 (draft). Three commits:

1. **Notification links** (from 7 Nov): admin-controlled email buttons, `{{link}}`, every in-app notification opens its page — migration **0113**.
2. **8 Nov QA round**: chat times, Overview vs My events, "leave page?" after save, repeated AI-report charts, admin landing speed — no migration.
3. **Event safety** (the tester's "biggest risk" + 6 related gaps): migration **0114**.

---

## 1. Notification links (0113)

| Ask | What changed |
|---|---|
| "Make it doable via admin setup" | Notification setup → each notification: **Add a button that opens the related page** + optional button text, with a live preview. "Button" chip on the list. |
| "Not every button but relevant ones" | On by default only where the recipient must act (review a response, pay/approve, fulfilment form, codes due, code issued, selected, new message, welcome). Informational emails start off. New notifications default to off. |
| Links inside email text | `{{link}}` anywhere in an email template becomes that recipient's page address at send time. |
| "In-app notification must take the user to the related page" | Every row opens `/dashboard/notifications/<id>`, which marks it read and redirects to the right page (old rows with no link go to the page for their kind). |

## 2. The 8 Nov QA round

| # | Reported | Outcome |
|---|---|---|
| 1 | Terms / Privacy still "to be finalised" | **Needs client/solicitor facts** — draft with every gap marked is `docs/legal/terms-and-privacy-draft.md`. |
| 2 | Priya still has no code | **Expected** — held for review as a possible duplicate; admin was alerted; her code issues when an admin presses Pass. |
| 3 | Sign-in 8–10 s | **Partly fixed** — the admin landing page's independent lookups now run together and one two-step query became one. The likely remaining cause is **hosting regions** (Vercel functions vs Supabase database) — see "For you" below. |
| 4 | Brands have no AI report | **Product decision** — recommended: admin generates, reviews and *publishes* a report to the brand (nothing unchecked reaches a brand). |
| 5 | Chat times in UTC | **Fixed** — chat times, day dividers and "Seen" show in the reader's own time zone, with a "Times shown in your time zone (GMT+5:30)" note. Everything else stays UK / event time on purpose. |
| 6 | Audience "My events" = Overview | **Fixed** — Overview is now a short **What's next** list (one line per event, the ones needing you first, "Do this now" → that event on My events). Both pages share one loader, which also fixed the Overview ignoring survey-link responses. |
| 7a | AI report repeats charts | **Fixed** — each chart once per report (also applied to reports already saved, web + Word). |
| 7b | Unread notifications pile up | **Fixed by part 1** — opening a notification marks it read; "Mark all read" and the 99+ cap already existed. |
| 7c | Artist profile asks "leave page?" after saving | **Fixed** — React empties the form's file fields after a save; the unsaved-changes check now re-baselines after that. |

## 3. Event safety (0114) — the tester's seven expectations

| # | Expectation | What now happens |
|---|---|---|
| 1 | Once a brand is matched, block Delete/Unpublish; "Request cancellation" instead; archive, not delete | **Database-enforced.** A listing in a live partnership can't be deleted, unpublished or archived; one with any partnership history can only be **archived** (hidden, kept). The artist's events page shows "In partnership SPE-… · Request cancellation" instead of the buttons. The brand or artist asks the team to cancel from the partnership page, with a reason; admins are notified. |
| 2 | Admin "Cancel event": stop registrations + surveys, void unused codes, email code holders, notify everyone, start refund, audit log | **Built** (admin event page → Cancellation). One action: registrations, surveys and code issuing stop and the public page comes down; codes not yet given out are withheld; brand, artist, every registered person and everyone on the waitlist is notified (code holders are told their code may no longer work); it's in the audit log; **paid invoices are listed with a link straight to the refund / credit-note screen** — no money moves without the admin (client decision). |
| 3 | Artist backs out before payment → cancel fulfilment form, offer brand another artist | Cancelling frees the campaign: it shows as needing a match again, so the team proposes another artist the usual way. A pending request can also be declined with a note. |
| 4 | Refuse survey answers after the deadline / event / campaign closed | **Database-enforced.** Closed campaign → closed. Cancelled event → closed (until a replacement is confirmed). **Pre-event** survey → closed once the event day is over; for someone not yet registered, also after the registration deadline. **Post-event** survey → open until the campaign is completed or closed (client decision). The page says why before anyone starts. |
| 5 | Confirmation before any delete | Delete and Archive both open a confirmation dialog saying what will happen. |
| 6 | Alert admin when codes run out; brand top-up | When a live event that has been issuing codes can't issue any more, **admins and the artist** are alerted once (artist email button: "Add more discount codes"); it also appears on **Waiting on artists** with a Nudge button. If still empty after **48 h** the **brand** is told (daily cron). Adding codes clears it. Codes come from the artist's ticketing platform, so the artist (or team) tops up, not the brand. |
| 7 | Optional registration cap / waitlist | **Cap + 10% waitlist** (client: "cap + 10% more waitlist for surveys"). Admin sets the cap per event (blank = no limit). When full, the next 10% (rounded up, at least 1) join a waitlist and **can still answer the survey**. A freed place — withdrawal, rejection, raised cap — goes to the longest-waiting person automatically; they're emailed and, if their survey passed, their code issues then. Beyond cap + 10%, registration and the survey say the event is full. |

Two things found and fixed while building this:

- Once an event is cancelled, people registered for it couldn't see its name (sign-in reads only cover confirmed events). They can now read **that** event.
- On Supabase, new database functions are callable by signed-out/signed-in users unless explicitly removed. The internal ones (e.g. the waitlist promoter) are now locked; only the intended ones are callable.

## Testing done

- **Database:** all 113 existing migrations + 0114 applied to a scratch Postgres (Supabase-style roles and default grants); 0114 applied twice (re-runnable). Scenarios as real users, through the real guard triggers: listing delete/unpublish/archive refusals; cancellation requests (duplicate, too short, not a party, non-admin cancel); cap 2 → third person refused → waitlist → waitlist full → promotion on withdrawal, on raised cap and on rejection; survey cut-offs (deadline, event passed, campaign completed, cancelled, replacement confirmed); codes ran out → one alert each → resolved on top-up; full cancellation (counts, notices, code-holder line, paid invoice returned, audit, no further codes, registration refused, second cancel refused). 17 refusal checks + every positive path pass. Verify script group K: 8/8 PASS.
- **App:** `npm run typecheck`, `npm run build` clean. Unit checks for the waitlist size (matches the database for every cap tested — a floating-point mismatch at e.g. cap 30 was caught and fixed), link labels, error wording, time zones, chart de-duplication.
- **Not tested:** in a browser against real data, and real email sends.

## For you to do

1. **Apply migrations in order:** `0113_email_button_settings.sql`, then `0114_event_cancellation_and_capacity.sql` — **before** deploying this code (some screens read the new columns).
2. **Verify:** run `docs/db-verify-0104-0109.sql`; groups J and K should be all PASS.
3. **Check hosting regions** (sign-in speed): Vercel → Settings → Functions → Function Region; Supabase → Project Settings → General → Region. If Vercel isn't next to Supabase (e.g. Washington vs London), move Vercel's.
4. **Client/solicitor:** the legal gaps in `docs/legal/terms-and-privacy-draft.md`; the brand AI-report decision.

## Browser test plan (throwaway events only)

Use a throwaway campaign + listing + sponsored event, never the real test event.

1. **Listing guard** — as the artist, on a listing in a confirmed partnership: no Delete/Unpublish; "Request cancellation" link instead. On a listing with no partnership: Delete asks for confirmation, then deletes.
2. **Request → decline** — artist asks to cancel (reason ≥ 1 sentence). Admin sees the banner + request; Decline with a note; artist is notified.
3. **Cap + waitlist** — admin sets cap 2 (waitlist 1). Register two audience accounts; the third sees "Join the waitlist" and lands on My events → "On the waitlist, number 1"; a fourth sees "full". First person withdraws → third is moved in and emailed.
4. **Survey cut-offs** — with a past registration deadline, a not-yet-registered account opening the survey link sees "Registration for this event has closed"; a registered one can still answer. Move the event date to yesterday → the pre-event survey shows closed.
5. **Codes ran out** — a tier with one pool code; one participant passes → code issued → admins + artist alerted, "Codes ran out" on Waiting on artists; add a code (reopen first if confirmed) → alert clears.
6. **Cancel** — admin cancels with a reason: confirmation dialog lists the effects; afterwards the page shows "Cancelled", how many were told, and the paid invoice → Refund link; the public page is gone; My events shows the cancelled card; the survey link shows "This event has been cancelled"; the campaign shows as needing a match.
