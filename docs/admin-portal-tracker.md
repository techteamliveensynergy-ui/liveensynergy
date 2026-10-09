# Admin Portal brief — tracker

Source: the client's *Admin Portal* document (latest copy 9 Oct 2026). Each
item, what was built, and anything still open. Merged to `main` in #13; migrations 0058–0060 applied to production on
9 Oct 2026.

## 1. Admin console overview

| Asked | Done |
|---|---|
| Needs attention: campaigns to match, awaiting agreement, awaiting payment, surveys awaiting review, open enquiries | ✅ all five tiles, each linking to the filtered list. Kept "Verified, unrewarded" and added "New campaign requests". |
| Platform: users, brands, artists, audience totals | ✅ (artists include pre-merge event organisers, noted on the tile) |
| Campaign revenue (monthly / to date) | ✅ paid invoices less refunds, inc. VAT; "this month" by London date |
| Campaigns: launched, live, surveys completed, surveys rejected, codes issued | ✅ survey numbers come from the running counters (0059), not by counting responses |
| Audience funnel: registered, survey participated, … | ✅ added "Took a survey" (participant responses not rejected) between Registered and Proof uploaded |
| Active campaigns | ✅ list of campaigns with a confirmed event, linking to each live-campaign page |

## 2. Users

| Asked | Done |
|---|---|
| Filter "Inactive users" | ✅ activity filter "Inactive users (30+ days)" (was "Inactive 30d+") |
| Filter "Inactive for more than 12 months" | ✅ new option; an account never used counts from its sign-up date. Same rule as the Compliance page count. |

## 3. Campaigns

| Asked | Done |
|---|---|
| Split requests and live, or one list with filters? | **Split**, per the brief's own sidebar list: *Campaign requests* (what brands submit) and *Campaigns live* (everything after a request is accepted), with a new "Live (event confirmed)" filter chip next to the existing status / matching chips. |
| Can't click a campaign request to see details | ✅ request detail page (`/dashboard/admin/campaigns/intake/[id]`) with every field the brand sent; brand name and "View details" on each list card open it. Campaigns open a new live-campaign page (below) from the brand name or "Open campaign". |
| "Edit" on a brand's request — needed? | **Not on requests** — the request stays exactly as the brand sent it. Admin changes details on the campaign after creating it from the request. On campaigns, Edit moved off the list card into the campaign page as a secondary button (`/dashboard/admin/campaigns/[id]/edit`). |
| "Message brand" / "Reply brand" on a request | ✅ on the request page, each request card, each campaign card and the campaign page. Opens the existing admin↔brand support thread, with the request / campaign reference as the subject on a new thread. |
| Request stuck "in review" (approved, campaign never finished) | Fixed while here: the request page offers "Continue creating the campaign", and it can now be declined. |

## 4. General

### Sidebar order ✅

Overview · Users · **Brands** (new) · **Artists** (replaces Events) ·
Participants · Campaign requests · Campaigns live · Surveys · Survey
responses · **Reporting & analysis** (new) · Enquiries · Messages · Feedback ·
Notification setup · Plans · Packages · Invoices · Payment settings ·
Notifications · Profile · Repository · Settings · **Compliance & audit** (new).

- Brands: each brand with open requests, campaigns, live count, account and message links.
- Artists: artists plus pre-merge organisers, with listings and sponsorships; the old Events view is one click away ("All events & sponsorships").
- Fixed while here: the sidebar now highlights only the closest match (on Campaign requests it no longer also highlights Campaigns; same for Survey responses / Surveys).

### Live campaign ✅

One "Live campaign" block, shown on the admin campaign page and on the
brand's and artist's event page, each seeing only what the brief allows:

| Element | Admin | Brand | Artist |
|---|---|---|---|
| Order form | ✅ full (editor) | ✅ full | ✅ only the "ok for artist" sections (campaign brief) |
| Live (pre-event) survey link | ✅ | ✅ | ✅ |
| Post-event survey link | ✅ | ✅ | ✅ |
| Participant numbers | ✅ | ✅ totals | ✅ totals |
| Discount codes issued | ✅ + who got which | ✅ counts only | ✅ counts only |
| Survey responses / analysis | ✅ full results + downloads | ✅ aggregated results only | ❌ |
| Check-in | ✅ (event page) | ❌ | ✅ |

How it's enforced, not just hidden (0060):
- **Codes:** brands and artists could previously read which participant held which code straight from the database (no screen showed it). They now read codes through a view with no participant or redeemer column.
- **Survey links:** come through `campaign_party_surveys()` — brand and artist have no access to survey setup otherwise.
- **Brand results:** `brand_survey_results()` returns totals per question only — no names, no individual answers, no open-text answers, no attention checks — and nothing per question until 5 responses are in.
- **Check-in QR:** removed from the brand's view of the event page.

### Compliance & audit ✅ (first version)

New page listing every area in the brief with an honest status:

| Area | Status |
|---|---|
| Administrator activity audit trail | Partly — new `admin_audit_log` records data downloads; Stripe settings changes already logged; other actions have who/when stamps |
| Data export approvals | Partly — every survey / participant download logged (who, when, what); no approval step |
| Marketing consent and withdrawal | Partly — current opt-in stored; no withdrawal history |
| Privacy notice / terms version history | Partly — version accepted per account; past document texts not archived |
| Data retention and deletion schedules | To discuss — shows 12-month-inactive count |
| Joint-controller campaign records | To discuss — approved order forms hold the brand's consents |
| Subject access / deletion requests | To discuss — use Enquiries meanwhile |
| Breach and incident logs | To discuss |

## Decisions to raise with the client

1. **Participant names for brand and artist.** The brief says brands and artists see participant *totals*; today the event page also lists participants by name (artists use it to verify attendance). Keep, or reduce to totals + anonymised IDs?
2. **Survey-completed tick per named participant** on the brand/artist event page — it shows *that* someone answered, not *what*. Keep?
3. **Brand results threshold** — results per question appear at 5 responses. Right number?
4. **Brand results timing** — live while the survey is open (current), or only after admin publishes them?
5. **Open-text answers for brands** — currently never shown. Moderated summary instead?
6. **Compliance items marked "to discuss"** — retention periods, DSAR workflow, incident log, joint-controller arrangement, export approval step.

## To ship

1. ✅ Migrations **0058, 0059, 0060** applied to production on 9 Oct 2026.
2. Merge the PR into `main` and deploy (`liveensynergy` remote).
3. Check: admin sidebar order; open a campaign request and a live campaign;
   the brand's event page shows the Live campaign block without the check-in
   QR; the artist's shows it with the QR; a survey download appears under
   Compliance & audit.
