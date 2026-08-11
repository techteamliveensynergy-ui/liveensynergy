# 10 Aug 2026 standup — issue tracker & test plan

Source: `Daily Standup - 2026_08_10 21_30 IST - Notes by Gemini.docx`
(Decisions, Next steps and Details, merged and de-duplicated — several items
describe the same piece of work), plus the six feedback screenshots embedded in
those notes.

Status recorded as of the implementation pass on **11 Aug 2026**.

---

## Before testing any of this

1. **Apply the migration.** `supabase/migrations/0023_standup_0810.sql`.
   One file, safe to run on the live database, but note two things it does
   *not* only add:
   - it **drops three unique indexes** (`artists_contact_phone_key`,
     `event_organisers_contact_phone_key`, `brands_manager_phone_key`) — that
     is the point of item 11;
   - it **rewrites seeded notification templates**. Any template you have
     edited by hand in Notification setup is left alone; only ones still
     holding the original seeded text are replaced;
   - it **re-declares `agree_to_sponsorship()`** from 0022 — a verbatim copy
     with one extra column, so the withdrawn-proposal notification can quote a
     reference. The locking and conflict checks are untouched.

2. **Accounts needed** (see `docs/qa-creds.md`): one brand, two artists, one
   audience member, one admin. Two artists again, because the campaign match
   and the chat relay both want more than one suggestion.

3. `npm run dev`, or test against a preview deploy.

---

## 1. Status summary

The standup raises 14 distinct pieces of work once the Decisions, Next steps
and Details sections are merged. Of those:

| Outcome | Count | Which |
|---|---|---|
| ✅ Built and shipped | 11 | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 |
| 📄 Written up, not code | 1 | 12 |
| ⏸️ Blocked on the payment build | 1 | 13 |
| ➖ Sakshi's, not development | 1 | 14 |

One defect was found while doing it (**D1** below) and fixed.

### Item by item

| # | Item | Status | What was done |
|---|---|---|---|
| 1 | Admin can't see or edit ticket price and capacity when managing an event | ✅ **Done** | Both now show in the Deal panel and are editable in the admin edit form, written through to the linked listing. |
| 2 | Can't tell who's speaking in an admin view of an artist↔sponsor chat | ✅ **Done** | Every message is captioned with its sender, and the two parties sit on opposite sides even when neither is you. |
| 3 | Admin can't start a chat with an artist or sponsor | ✅ **Done** | "+ New chat" on the admin Messages page, plus a "Message …" button on any enquiry from a known account. |
| 4 | Remove the `https://` from the profile link fields | ✅ **Done** | Link fields show and tidy to `example.com`; the stored value is still the full canonical URL. |
| 5 | Audience can still withdraw after being selected | ✅ **Done** | Button replaced with a line pointing at the team, and the delete is scoped to unselected rows — so a hand-crafted post does nothing either. |
| 6 | Selection should be a randomiser, not brands and artists picking names | ✅ **Done** | Select/Reject gone from the brand and artist page *and* from their server action; a random draw runs from the admin event page. |
| 7 | Text box for brands to suggest an external event / link, shared via chat | ✅ **Done** | New section on the campaign form; shown to the team and to artists browsing; relayed into the brand↔artist chat when the campaign is matched. |
| 8 | Enquiry form loses the sponsorship number — open in a new tab, pre-filled | ✅ **Done** | "Raise an enquiry ↗" from a sponsorship opens `/contact` in a new tab with the reference, subject, name and email already in place. |
| 9 | Enquiries in the dashboard lack event references; can't message the enquirer | ✅ **Done** | Reference shown on every enquiry; "Message …" opens a thread with them in-app. |
| 10 | Notifications missing campaign / submission numbers | ✅ **Done** | 14 templates rewritten to quote their reference; call sites now pass every token they use. |
| 11 | Same person can't register as more than one role on one phone number | ✅ **Done** | Phone uniqueness narrowed to audience accounts. Duplicate audience profiles are still blocked — that part was the point. |
| 12 | Review the payment / KYC research | 📄 **Written up** | `docs/payments-kyc-strategy.md` — the decision, why Stripe Connect Express was rejected, the commercial model, and the six build steps in order. |
| 13 | Event listings go live only once payment is confirmed | ⏸️ **Blocked** | Needs the payment integration to exist first. Designed in §5 of the payments doc, including where it lands in the existing status ladder. |
| 14 | Upload the drafted terms & conditions | ➖ **Sakshi's** | The `/terms` long-form copy is still placeholder, as it was after 3 Aug. |

### On "prevent duplicate profiles"

Worth being explicit, because items 11 and "prevent duplicate audience
profiles" pull in opposite directions and both were agreed:

- **Still blocked:** two audience accounts on one phone number.
- **Now allowed:** an audience account and an artist / brand / organiser
  account on the same number.
- **Unchanged and unavoidable:** Supabase Auth keys an account to an email
  address, so registering a second role still needs a second email. Nothing in
  this batch changes that, and it wasn't raised as the blocker — the phone
  number was.

### Defect found while testing this

**D1 — "Contact organiser" silently did nothing the second time.**
`getOrCreateConversation()` looked for an existing thread with
`.is("listing_id", listingId)`. PostgREST's `is.` operator only understands
`null` / `true` / `false`, so with a real listing id the request came back 400,
the error was discarded, and the function concluded there was no thread and
tried to create one. That insert then violated `conversations_unique_thread`
(0008), returned null, and the caller bounced the user back to Discover with no
message. So a brand could open a conversation about an event exactly once;
every attempt after that looked like a dead button. Fixed to use `eq` for a
value and `is` only for null. This sat directly under item 7 — the chat relay
would have hit the same wall on a second round of suggestions.

---

## 2. Detail, remarks and test cases

Fill in the **Result** column as you go.

### 1 — Ticket price & capacity in the admin event editor

**What changed:** both fields added to the admin edit form and to the Deal
panel. They live on `event_listings`, not on the sponsorship, so saving writes
them through to the linked listing.
**Files:** `admin/events/sponsored/[id]/EventEditForm.tsx`,
`admin/events/sponsored/[id]/page.tsx`, `admin/actions.ts`.

**Remarks:** editing here changes the listing itself, which is what you want —
the sponsorship page quotes the listing's ticket price and divides by it to get
"people this can sponsor", so two different numbers would be worse than one
wrong one. A sponsorship with no linked listing has nowhere to put them, and
the fields are hidden in that case rather than silently discarding input.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T1.1 | Admin → Events → a sponsored event with a listing. Look at the Deal panel. | "Ticket price" and "Capacity" are listed alongside Campaign / Listing / Venue / Deadline. |  |
| T1.2 | Scroll to "Edit event details". | Both fields are present and populated, and the ticket price hint names the listing they save to. |  |
| T1.3 | Change the ticket price to £25 and save (confirm the dialog). | Saves. The Deal panel and the brand's view of the event both show £25. |  |
| T1.4 | On the same event, check "People this can sponsor" as the brand. | Recalculated at the new ticket price. |  |
| T1.5 | Open the underlying listing as its artist. | The new price and capacity are on the listing too. |  |
| T1.6 | Open a sponsored event created **without** a listing. | The two fields are absent from the form; everything else still saves. |  |
| T1.7 | Clear the ticket price and save. | Stored as empty; "people this can sponsor" falls back to "—" rather than dividing by zero. |  |

### 2 — Telling the speakers apart in chat

**What changed:** each message is captioned with its sender; a viewer who isn't
a party to the thread gets the brand on the right and the partner on the left;
the thread header and list name both parties.
**Files:** `dashboard/messages/page.tsx`, migration 0023 step 2.

**Remarks:** admins are always labelled "Live·En·Synergy team" to everyone but
themselves — a support thread is with the team, not with a named member of
staff, and that's how the rest of the product already words it. Reading a
counterparty's name needs the new `profiles: read my conversation peer` policy;
without the migration applied, names fall back to "Someone".

| ID | Steps | Expected | Result |
|---|---|---|---|
| T2.1 | Admin → Messages → "With artists & sponsors" → a brand↔artist thread. | Each message is captioned with the sender's name; the brand's messages are on the right, the artist's on the left. |  |
| T2.2 | Look at the thread list on the left. | Each row's second line reads "Brand ↔ Artist" rather than "Incoming enquiry". |  |
| T2.3 | Look at the thread header. | The two parties are named under the thread title. |  |
| T2.4 | As the **brand**, open the same thread. | Your own messages are still on the right in brand orange; the artist's are named on the left. |  |
| T2.5 | As any user, open a thread with the team. | The other side reads "Live·En·Synergy team", not an admin's personal name. |  |
| T2.6 | Send a message and reload. | The new message is captioned "You". |  |

### 3 — Admin-initiated chat

**What changed:** `startAdminThread` opens (or reuses) a support-shaped thread
between a chosen user and the calling admin. Reachable from Messages and from
the enquiry inbox.
**Files:** `dashboard/messages/NewAdminThread.tsx`,
`dashboard/messages/actions.ts`, `lib/data/messaging.ts`,
`admin/enquiries/page.tsx`, migration 0023 step 3.

**Remarks:** it reuses the existing support-thread shape deliberately — the
user finds it under "With Live·En·Synergy team", exactly where they'd expect a
message from us, with no new inbox and no new notification plumbing. Admins
aren't in the picker: the shape is "a user and the team", so an admin-to-admin
thread would land in the wrong tab at both ends.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T3.1 | Admin → Messages. | A "+ New chat with an artist or sponsor" button above the tabs. |  |
| T3.2 | Click it. | A panel with a person picker grouped by role, an optional subject, and Start chat. |  |
| T3.3 | Pick an artist, add a subject, start. | Lands in the thread on the support tab with a green confirmation. |  |
| T3.4 | Send a message. Sign in as that artist. | It's under Messages → "With Live·En·Synergy team", and they have a notification. |  |
| T3.5 | Back as admin, start a chat with the **same** artist again. | Opens the existing thread rather than creating a second one. |  |
| T3.6 | Confirm no admin appears in the picker. | Only brands, artists, organisers and audience members, and only active accounts. |  |
| T3.7 | As a non-admin, look at Messages. | No "New chat" control — it's admin-only. |  |

### 4 — No more `https://` in link fields

**What changed:** `displayUrl()` strips the scheme for display; `UrlInput`
shows and tidies to that form; social placeholders lost their `https://`;
public profile video links display without the scheme.
**Files:** `lib/urls.ts`, `components/ui/UrlInput.tsx`,
`components/onboarding/parts.tsx`, `components/PublicProfileView.tsx`.

**Remarks:** nothing about what gets **stored** changed — `normaliseUrl()`
still adds the scheme on the way in, so every saved link is a full canonical
URL. The field's own hint has always said "no need to type https://"; it just
used to fill itself with `https://` the moment you clicked away.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T4.1 | Profile → Website. | An existing link shows as `www.hivtroop.com`, not `https://www.hivtroop.com/`. |  |
| T4.2 | Look at the social link placeholders. | `instagram.com/…`, `x.com/…` etc. — no `https://`. |  |
| T4.3 | Type `northwavecoffee.com` and tab away. | Stays as typed; no scheme is bolted on in front of you. |  |
| T4.4 | Type `HTTPS://Foo.com/path?x=1` and tab away. | Tidies to `foo.com/path?x=1`. |  |
| T4.5 | Save, reload, and check the public profile's Website link. | Opens correctly — the stored value is still the full `https://` URL. |  |
| T4.6 | Type `not a link` and tab away. | Still rejected, with the same inline message as before. |  |
| T4.7 | Add a video link, save, and view the public profile. | Non-embeddable links display without the scheme; embeds still play. |  |

### 5 — No withdrawal after selection

**What changed:** the Withdraw button is replaced with an explanation once
`selected` is true, and `withdrawParticipation` only deletes unselected rows.
**Files:** `dashboard/participations/page.tsx`,
`dashboard/participations/actions.ts`.

**Remarks:** the `.is("selected", false)` on the delete is the rule; hiding the
button is the courtesy. Someone who is selected has part of a sponsor's budget
earmarked against them and a headcount the organiser is relying on.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T5.1 | As audience, register for an event. My events. | Withdraw is offered. |  |
| T5.2 | Click it. | The registration is gone. |  |
| T5.3 | Register again; have the admin draw or select you. Reload My events. | No Withdraw button — instead "You're selected — contact the team if you can no longer attend." |  |
| T5.4 | *(Server-side check)* Post that participation's id to `withdrawParticipation` by hand. | Nothing is deleted. |  |

### 6 — Selection by random draw ⭐

**What changed:** `updateParticipation` (brand/artist) has no `select` or
`reject` branch at all any more — only `verify`. A new `runSelectionDraw`
admin action picks the winners at random.
**Files:** `dashboard/sponsored/actions.ts`, `dashboard/sponsored/[id]/page.tsx`,
`admin/marketplace-actions.ts`,
`admin/events/sponsored/[id]/SelectionDrawForm.tsx`,
`admin/events/sponsored/[id]/page.tsx`.

**Remarks:**
- The draw uses Fisher–Yates. A `sort(() => Math.random() - 0.5)` is neither
  uniform nor stable and would quietly bias the draw towards whoever
  registered first — which is exactly the thing a random draw is meant to
  stop.
- The suggested number of places is what the remaining budget covers at the
  listing's ticket price. It's editable, because a run can be split into
  rounds and because an event with no ticket price has nothing to derive it
  from.
- Anyone not drawn is **left alone, not rejected** — places free up when a
  selected person doesn't upload a ticket in time, and the draw can be re-run
  for the remainder.
- Manual Select survives on the admin page only, relabelled "Select by hand",
  for fixing a draw rather than running one.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T6.1 | As a brand or artist, open a confirmed event with registrations. | No Select and no Reject next to anyone. Unselected people read "Awaiting the random draw". |  |
| T6.2 | Read the participants intro copy. | Says the draw is run at random by the team and isn't picked by hand on either side. |  |
| T6.3 | *(Server-side check)* Post `op=select` — and separately `op=reject` — to `updateParticipation` as the brand. | Nothing changes. Neither branch exists. |  |
| T6.4 | Admin → the same event → Participants. | A "Random selection draw" panel with a places field defaulted from the budget ÷ ticket price, and the number waiting. |  |
| T6.5 | Run the draw for fewer places than there are people. | Confirmation dialog first; then "Drew N of M waiting — X still in the pool for a later round". |  |
| T6.6 | Check the drawn participants. | Marked selected, with a notification each; their My events shows the ticket-upload step. |  |
| T6.7 | Check someone not drawn. | Untouched — still `registered`, not rejected, still in the pool. |  |
| T6.8 | Run the draw again for the remaining places. | Draws from those left; the already-selected aren't re-drawn. |  |
| T6.9 | Run a draw on an event where nobody is waiting. | The panel isn't shown at all. |  |
| T6.10 | On an event with no ticket price, open the panel. | No suggested figure; the hint says to enter the number yourself. |  |
| T6.11 | Enter 0 or a blank and submit. | Rejected with "Enter how many places the draw is for." |  |
| T6.12 | Run the same draw twice quickly, same places. | The second run draws from what's left, not from the whole pool. |  |

### 7 — Suggest an external event / link

**What changed:** `campaigns.suggested_event_note` + `suggested_event_url`, a
new "Know an event already?" section on the campaign form, display on the
brand's campaigns, the admin campaign card and the artist-side browse, and a
relay message into the brand↔artist chat on match.
**Files:** `dashboard/campaigns/CampaignForm.tsx`,
`dashboard/campaigns/actions.ts`, `dashboard/campaigns/page.tsx`,
`admin/campaigns/page.tsx`, `dashboard/discover-campaigns/page.tsx`,
`admin/marketplace-actions.ts`, migration 0023 steps 3 & 4.

**Remarks:** the relay is posted **by the admin, under their own name** —
"Brand X has an event in mind for campaign CMP-00004: …" — not faked as coming
from the brand. The team is genuinely the one passing it on, and the new
`messages: admin send` policy keeps `sender_profile_id = auth.uid()` so nothing
here can write a message under someone else's name. The link goes through the
same `normaliseUrl` as every other link field, so a bad one is reported rather
than silently dropped.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T7.1 | Brand → new campaign. Scroll past the manager section. | A "Know an event already?" section with a description box and a link field. |  |
| T7.2 | Fill both in and submit. | Saves. The campaign card shows "Your suggested event: …" with an "Open link ↗". |  |
| T7.3 | Enter `not a link` in the link field and submit. | Rejected with "The suggested event link doesn't look like a valid link." Note the campaign form doesn't echo your input back on a rejection — that's pre-existing behaviour across this form, not new here. |  |
| T7.4 | Enter `eventbrite.co.uk/e/123` (no scheme) and submit. | Accepted; the link opens correctly. |  |
| T7.5 | Admin → Campaigns → that campaign. | A gold "Sponsor suggests: …" block on the card. |  |
| T7.6 | As an artist, Discover campaigns → that campaign. | "They've suggested: …" on the card. |  |
| T7.7 | Admin matches the campaign to a listing. Sign in as that listing's artist → Messages. | A thread with a message from the team quoting the brand's suggestion and the campaign reference, plus a notification. |  |
| T7.8 | Match a campaign with **no** suggestion. | No relay message — the thread isn't created for the sake of it. |  |
| T7.9 | Match a campaign to **two** listings. | Each artist gets the relay in their own thread; neither can see the other's. |  |
| T7.10 | Leave the suggestion empty on a campaign that had one, and save. | Clears from all three views. |  |

### 8 & 9 — Enquiries carry their reference

**What changed:** `/contact` accepts `?ref=&subject=`, pre-fills a signed-in
visitor's name and email, and stores the reference plus their profile id.
"Raise an enquiry ↗" links added to the brand/artist and admin sponsorship
pages, opening in a new tab. The admin inbox shows the reference and offers
"Message …".
**Files:** `(marketing)/contact/page.tsx`, `(marketing)/contact/ContactForm.tsx`,
`(marketing)/contact/actions.ts`, `dashboard/sponsored/[id]/page.tsx`,
`admin/events/sponsored/[id]/page.tsx`, `admin/enquiries/page.tsx`,
migration 0023 step 5.

**Remarks:** `profile_id` is taken from the session, never from the form — the
contact endpoint is public, and a posted profile id would let anyone file an
enquiry as somebody else. The reference is *shown* on the form rather than
hidden, because you should be able to see what you're quoting.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T8.1 | Open a sponsorship as the brand. Find "Raise an enquiry ↗". | Opens `/contact` in a **new tab** — the sponsorship stays open behind it. |  |
| T8.2 | Look at the form. | "About SPE-00003" at the top; subject pre-filled with the reference and event name; your name and email already in place. |  |
| T8.3 | Submit it. Admin → Enquiries. | The enquiry is listed with an `SPE-00003` chip and "has an account". |  |
| T8.4 | Expand it and click "Message …". | Opens a thread with that person; they see it under "With Live·En·Synergy team". |  |
| T8.5 | Submit `/contact` from the public site, signed out. | Still works. No reference chip, no "Message" button — "Reply by email" as before. |  |
| T8.6 | Check the admin bell after an enquiry. | "Enquiry from … · SPE-00003", not a generic line. Without a reference it reads "no reference" rather than a literal `{{reference}}`. |  |
| T8.7 | Do the same from the **admin** sponsorship page. | Same new-tab behaviour, same pre-fill. |  |

### 10 — Notifications quote their reference

**What changed:** 14 templates rewritten in the migration; call sites updated
to pass `reference` (and a fallback for `budget`) wherever a template uses it.
**Files:** migration 0023 step 6, `dashboard/sponsored/actions.ts`,
`admin/marketplace-actions.ts`, `(marketing)/contact/actions.ts`.

**Remarks:** `renderTemplate` leaves an unresolved token **visible** as
`{{budget}}`, which is worse than the generic copy it replaces — so every token
used in a template has a real fallback at its call site ("to be agreed",
"no reference"). Templates you have edited by hand are not touched by the
migration.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T10.1 | Submit a feedback report. Admin → Notifications. | "New feedback report FB-00012" with the reporter, the kind and the title — not "A user submitted a bug or text change". |  |
| T10.2 | Check the reporter's own notifications. | "Feedback logged as FB-00012". |  |
| T10.3 | Create a campaign. Check the brand's and the admin's notifications. | Both quote `CMP-000NN` and the budget. |  |
| T10.4 | Match it. Check the brand's notification. | Names the campaign reference and the event. |  |
| T10.5 | Confirm a sponsorship from both sides. | Both parties get "Sponsorship SPE-000NN confirmed" with the budget. |  |
| T10.6 | Check the losing artist's notification on a multi-suggestion campaign. | "Proposal SPE-000NN withdrawn", with a real reference. |  |
| T10.7 | Create a sponsored event with **no** budget set. | The notification reads "to be agreed" — not a literal `{{budget}}`. |  |
| T10.8 | Admin → Notification setup → edit a template by hand, then re-run the migration. | Your wording survives. |  |
| T10.9 | Admin → Notification setup → any rewritten event. | The listed available variables match what the template actually uses. |  |

### 11 — One person, several roles

**What changed:** `phone_in_use()` checks `audience_members` only; the three
other unique indexes are dropped; `phoneTaken` is no longer called from the
brand, artist or organiser save.
**Files:** `onboarding/actions.ts`, migration 0023 step 1.

**Remarks:** the rule exists to stop one person entering the same reward draw
twice under two audience accounts. That is preserved exactly. Everything the
wider rule caught by accident — an artist who also attends events, an agency
running two brand accounts off one desk phone — now works.

| ID | Steps | Expected | Result |
|---|---|---|---|
| T11.1 | Register an audience account on `+44 7700 900123`. | Saves. |  |
| T11.2 | Register a **second audience** account on the same number. | Still rejected: "already registered to another audience account". |  |
| T11.3 | Try `07700900123` on that second audience account. | Also rejected — same number, different format. |  |
| T11.4 | Register an **artist** account on `+44 7700 900123`. | **Saves.** This is the change. |  |
| T11.5 | Register a **brand** account on the same number. | Saves. |  |
| T11.6 | Two brand accounts on one manager phone (the agency case). | Both save. |  |
| T11.7 | Re-save the first audience profile without touching the number. | Saves — it doesn't collide with itself. |  |
| T11.8 | Check the indexes after migrating. | `audience_members_phone_key` exists; the artists / organisers / brands ones are gone. |  |

### D1 — Conversations could only be opened once

**What changed:** the existence check in `getOrCreateConversation` uses `eq`
for a real listing id and `is` only for null.
**Files:** `lib/data/messaging.ts`.

| ID | Steps | Expected | Result |
|---|---|---|---|
| TD1.1 | As a brand, Discover events → an event → "Contact organiser". | Opens the thread. |  |
| TD1.2 | Go back to Discover and click it again on the **same** event. | Opens the **same** thread — not a bounce back to Discover, and not a second thread. |  |
| TD1.3 | Admin → Messages. | One thread per brand/artist/event, not several near-identical rows. |  |

---

## 3. Regression checks after the migration

| ID | Steps | Expected | Result |
|---|---|---|---|
| R1 | Sign in as each of brand / artist / event / audience / admin. | All dashboards load; nav unchanged per role. |  |
| R2 | Audience → Discover → register for an event. | Works; lands on My events with the confirmation. |  |
| R3 | Brand ↔ artist Messages: send with and without an attachment. | Both send; attachments still open via a signed URL. |  |
| R4 | Admin → Users list, filters and CSV export. | Load without error — 0023 adds a `profiles` policy alongside the existing ones, it doesn't replace them. |  |
| R5 | Onboarding for all four roles, first time through. | Saves; the phone rule only fires on a duplicate audience number. |  |
| R6 | Public pages (`/`, `/about`, `/events`, `/contact`, `/terms`). | Load. `/contact` works with and without `?ref=`. |  |
| R7 | Attendance QR check-in at `/attend/[token]`. | Still confirms attendance. |  |
| R8 | Admin releases a reward on a verified participant. | Still admin-only, still draws the budget down correctly. |  |
| R9 | `npm run typecheck && npm run build`. | Both pass. | ✅ verified 11 Aug |

---

## 4. Still open

| Item | Blocked on |
|---|---|
| **13 — Listings go live on payment confirmation** | The payment integration. Designed in `docs/payments-kyc-strategy.md` §5; needs a decision on whether "paid" is a new status or a timestamp on the existing `confirmed`, and on what happens to a sponsorship that's agreed but never paid. |
| The £2.50 per-payout charge | Whether it comes out of the sponsor's pool or off the recipient's payment. It changes `netSponsorshipBudget()` and every "people this can sponsor" figure, so it isn't cosmetic. See §7 of the payments doc. |
| Full legal copy on `/terms` | Sakshi's drafting task, carried over from 3 Aug. |
| GitHub mirroring for the feedback widget | Still just `GITHUB_TOKEN` + `GITHUB_FEEDBACK_REPO` in the Vercel environment. Carried over from 3 Aug. |
| **8 — Location / GPS verification on QR scan** | Carried over from 3 Aug, unchanged: needs the Maps API key, a decision on radius, and somewhere for organisers to record event coordinates. |
| Branded email templates | Carried over from 3 Aug — you asked to plan this separately. |
