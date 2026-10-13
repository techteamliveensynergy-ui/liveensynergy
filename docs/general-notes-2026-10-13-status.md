# General Notes (13 Oct) — status and plan

Every item in the client's "General Notes" document, checked against the live
site and code on 13 Oct (after PRs #17–#24). ✅ done and live · 🟡 partly ·
❌ not done · ⚙️ needs a settings change, not code · ❓ needs a decision.

## Status

### Surveys

| Item | Status | Notes |
|---|---|---|
| Bigger videos; reel vs normal; choose video size | ✅ | PR #17 (0062) |
| Bigger questions + font-size choice | ✅ | PR #17 |
| Media to the card edges, smaller corner radius | ✅ | PR #17 |
| PPT-size welcome / thank-you cards | ✅ | PR #17 |
| Recommended image sizes | ✅ | Shown in the builder |
| Space between question and options; help text under the question | ✅ | PR #17 |
| More background-image opacity; card colour / themes | ✅ | PR #17 |
| Typeform look | 🟡 | Conventions applied; the video link couldn't be opened from the build environment |
| Logic and branching | ❌ ❓ | Designed (`docs/survey-feedback-2026-10-13-plan.md` §1), waiting on the open client questions there |
| "Other — please specify" | ✅ | PR #19 (0065) |
| Rating question with several elements | ✅ | PR #19 (rating group) |

### Brand

| Item | Status | Notes |
|---|---|---|
| Multiple event categories; thank-you; view request; "Converted to Live Campaign" | ✅ | PR #17 |
| Live campaign next steps (codes, survey) instead of "contact" | ✅ | PR #17 |
| Campaign requests / Campaigns live split | ✅ | PR #17 |
| Divider grouping campaign details + order form | ✅ | PR #22 |
| Real campaign name instead of "Conferences" | ✅ | PR #22, #24 (older test campaigns CMP-00001–00007 have no name; admin list flags them) |
| Click into a campaign | ✅ | PR #20 |
| Campaign statuses (Live, Completed + note, Closed + reason) | ✅ | PR #21, #24 (0066) |
| Sidebar modules | 🟡 | **Invoices** added (PR #25). Still missing **Reporting & Analysis**; **Sponsored events** kept until decision 2 |
| Invoices information in an Invoices module | ✅ | PR #25: `/dashboard/invoices` — to pay / overdue / paid totals, every invoice with campaign, dates, refunds, PDF and "View & pay" |
| Correct information cards / clean-up of the brand dashboard | ✅ | PR #26 — see "Brand dashboard" below |

### Brands & artists

| Item | Status | Notes |
|---|---|---|
| Emails not received for chat messages | ⚙️ | **Resend is in test mode**: every email to anyone but techteamliveensynergy@gmail.com is rejected ("verify a domain"). Affects all platform email, not just chat. |
| "New message from Live·En·Synergy's team" instead of the counterparty | ❓ | By design since migration 0030: brands and artists message the team, not each other, so the team *is* the sender. The template also only says "A new chat message from the counterparty." |
| Welcome first, then "Let's get your profile set up!" | ✅ | PR #23, all account types |

### Supabase

| Item | Status | Notes |
|---|---|---|
| Confirm / reset-password emails go to localhost | ⚙️ | Code side fixed in PR #25: no localhost fallback (uses the request's own origin), callback accepts `?code=` and `?token_hash=`, failed links explain themselves on sign-in. Still needs the Supabase **Site URL / Redirect URLs** setting, and optionally the email-template change in `docs/email-setup.md` §2.6 so links work on another device. |

### Artist

| Item | Status | Notes |
|---|---|---|
| Welcome + profile set-up | ✅ | PR #23 |
| "Which applies to you" (Artist/Group, Promoter/Management, Event Organiser, Venue Operator) | ❌ | Only an event-category select exists |
| Remove DOB and sponsor value from set-up | ✅ | PR #25: no longer asked (artist and legacy organiser forms); existing answers stay on file for admins; sponsor value no longer shown on public profiles (decision 3 can bring it back) |
| Save details and finish later (profile, event, campaign request) | 🟡 | Events can be saved as a draft; profile and campaign request can't |
| View your profile + update your profile | ✅ | "Preview public profile" on the Profile page and in the sidebar |
| Event end time; "Describe your event audience" | ❌ | Only a start time; no audience field |
| Click into an event to preview it | ✅ | PR #25: `/dashboard/events/<id>/view` — owner, admin and brands (where RLS allows); event names and a View button on My events |
| Upcoming event cards on the dashboard (and admin dashboard) | ✅ | PR #26: artist home lists upcoming events with dates; admin overview has an "Upcoming events" list |
| Unable to open event listing | ✅ | PR #25 fixed the thread's "Event details" link (now the read-only view) and the draft-reset bug (edit and Publish/Unpublish leave matched/closed listings alone). PR #26: the public Events page now lists real events open for sponsorship (it showed hard-coded samples), each opening the event page |
| Artist Fulfillment form | ❓ | The Google Doc isn't shared with us — needs access or its content |
| Campaign Briefs as a list | ✅ | PR #26: one row per brief (brand, campaign, event, date) opening to the full brief |
| "Worst-case discount cost: £1,250" | 🟡 | Relabelled "Maximum discount if every code is used" (PR #25). Hiding it from artists instead is decision 5 |
| Show artist's events on their public profile | ✅ | PR #26: upcoming events open for sponsorship, on artist and organiser profiles |
| Correct information cards / clean-up of the artist dashboard | ✅ | PR #26 — see "Artist dashboard" below |

### General

| Item | Status | Notes |
|---|---|---|
| Read / delivered ticks in chat | ❌ | `messages.read_at` exists but is never written |
| Recall a message sent by mistake | ❌ | |
| Times one hour behind | ✅ | PR #25: every date/time helper, chat day headings, CSV exports and the participation-deadline inputs use UK time |
| Can an event link be sent in chat and viewed by the brand? | ✅ | PR #25: links in messages are clickable; the event view page opens for brands |
| Phone number when an audience member signs up to take a survey | ✅ | Required on the survey sign-up (PR #18) |
| Password setting | ❓ | The note says "I forgot what I wanted to ask" |

### Brand dashboard (cards to correct) — ✅ PR #26

Now: Requests in review · Active campaigns (incl. awaiting payment) · Attendees checked in · To pay; active campaigns only in the list; "Requests with our team" replaces "Suggested for you"; "Your events" links each agreed event.

Was:


- "Committed budget" adds up every campaign's package price, including closed and unpaid ones, and says "budget".
- "Verified attendees" uses the old cash-reward status wording.
- "Active campaigns" ignores campaigns awaiting payment.
- "Campaigns in flight" lists closed ones too.
- "Suggested for you" shows the three newest listings for everyone — not matched to the brand, and matching is now done by the team.
- "Confirmed sponsorships" copy describes brand/artist negotiation (old model) and links to Sponsored events, not the campaign.
- Missing: requests in review, amount due / invoices, survey results.

### Artist dashboard (cards to correct) — ✅ PR #26

Now: Upcoming events · Waiting on you (terms to agree + discount codes to confirm) · Sponsored events · Attendees checked in; upcoming events with dates; a "Waiting on you" list and a Campaign briefs count replace the old offers/enquiries copy.

Was:


- "Sponsor offers pending", "Review sponsor offers" and "Brand enquiries waiting · N open" describe the old direct brand-artist marketplace; the enquiry count is every conversation, not open ones.
- "Verified attendees" uses the old cash-reward wording.
- "My events" has no dates and no upcoming filter.
- Missing: Campaign briefs, discount codes to confirm, upcoming events.

## Plan

### Phase 0 — settings (you, ~30 min, no code)

1. **Resend:** add and verify the sending domain (DNS records Resend gives you), then set `EMAIL_FROM` in Vercel to an address on it. Fixes chat emails and every other email.
2. **Supabase → Authentication → URL Configuration:** Site URL = the live site; add `https://<live site>/auth/callback` to Redirect URLs. Check `NEXT_PUBLIC_SITE_URL` is set in Vercel (Production).
3. Share the **Artist Fulfillment** Google Doc (or paste it in).

### Phase 1 — bugs and quick fixes (~1 day, no decisions needed)

1. ✅ Times shown in UK time everywhere (chat, notifications, invoices, admin).
2. ✅ Email links: accept both Supabase link formats and stop falling back to localhost.
3. ✅ Editing a matched/closed event no longer resets it to draft.
4. ✅ Clickable links in chat; fix the thread's "Event details" link.
5. ✅ Readable request references (`REQ-00012` instead of `INT-7B825C92`) — migration 0068, PR #26.
6. ✅ Invoice footer copy that says "no card details" while Stripe card payment exists.

### Phase 2 — brand (~2 days)

1. ✅ **Invoices** module: every invoice with campaign, amount, due date, status, pay link, PDF and refunds.
2. **Reporting & Analysis** module: each campaign's surveys with results (aggregated, as today), plus participants and codes redeemed.
3. Sidebar in the client's order.
4. ✅ Dashboard cards cleaned up (above).

### Phase 3 — artist (~2–3 days, one small migration)

1. "Which applies to you" question at the top of set-up (stored, shown on the public profile).
2. ✅ Remove DOB and sponsor value from set-up.
3. Event end time and "Describe your event audience".
4. ✅ Read-only event preview (owner, admin, and brands where relevant); cards clickable.
5. ✅ Upcoming events on the artist home and admin dashboard.
6. ✅ Campaign Briefs as a compact list, opening to the full brief.
7. ✅ Artist's upcoming events on their public profile.
8. ✅ Dashboard cards cleaned up (above); clearer discount-cost wording.

### Phase 4 — bigger features (~3–4 days)

1. Save details and finish later — profile set-up, event, campaign request.
2. Chat: read receipts ("Seen"), delivered state, and recall within a time window.
3. Survey logic and branching (once the open questions are answered).

## Decisions needed

1. **Messaging:** keep all chat going through the Live·En·Synergy team (current design) — then the notification should say "New message from the Live·En·Synergy team about <campaign>" — or let brands and artists message each other directly?
2. **Sponsored events** in the brand sidebar: keep it, or fold it into Campaigns live?
3. **Sponsor value:** remove it completely (also from the public profile), or just from set-up?
4. **Recall:** how long after sending (e.g. 15 minutes)? Should admins still see recalled messages?
5. **Worst-case discount cost:** relabel ("Maximum discount if every code is used") or hide from artists?
6. **Password setting:** what was the question?
7. **Survey branching:** the open questions in `docs/survey-feedback-2026-10-13-plan.md`.
