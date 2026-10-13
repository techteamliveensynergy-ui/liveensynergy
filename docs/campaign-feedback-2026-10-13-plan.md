# Campaign feedback — 13 Oct 2026

The client's notes on creating and following a campaign as a brand, and what
was built for each.

| # | Client note | What was built |
|---|---|---|
| 1 | Can brands select multiple categories of events? | Yes. The request form's category dropdown is now a tick-any-number checklist; "Other" reveals a "please specify" box. Stored in `campaign_intake_requests.categories` (0063). The old single `category` is kept as the first pick, so the admin's conversion prefill is unchanged. Admin request list/detail show every category. |
| 2 | Thank-you message after submitting a campaign | Submitting now lands on the request's own page with a thank-you panel: the reference, and the four steps that follow (review within 3 days → order form → invoice → artist matched, codes set up, survey published). |
| 3 | View the campaign request after submission | New read-only page `/dashboard/campaigns/requests/[id]` for every status, with a status explainer: still editable / in review (message the team) / converted (link to the live campaign) / declined (reason). Edit and Withdraw stay limited to "Submitted". Each request in the list has a View button. |
| 4 | "Converted" → "Converted to Live Campaign" | Status badge and the admin's filter tabs. |
| 5 | Live campaign said "awaiting payment" and "Contact" — say what's next instead (artist configures discount codes, campaign survey published) | Each live campaign now shows a checklist: Invoice paid → Artist matched → Artist sets up discount codes → Campaign survey published → Campaign live. The first unfinished step is spelled out ("Next: the artist is configuring and confirming the discount codes…"), with the invoice / Sponsored events / event link where relevant. "Contact" became a small "Questions? Message the team" link. Closed/completed campaigns show a one-liner with a results link instead. |
| 6 | Split the brand's Campaigns section into "Campaign requests" and "Campaigns live" | Two sidebar entries. **Campaign requests** (`/dashboard/campaigns`) holds requests. **Campaigns live** (`/dashboard/campaigns/live`) holds campaigns, order forms, billing reminder and invoices. An order form waiting for review is flagged on both pages. Invoice pages highlight "Campaigns live". |

## Edge cases covered

- **Old links.** `/dashboard/campaigns/[id]` (the edit page) now redirects a non-editable request to its read-only page, and a *campaign* id to Campaigns live. The `campaign.status_changed` notification used to link there with a campaign id and 404'd; it, and the converted / opened / paid / declined notifications, now point at the new pages.
- **Refresh after changes.** Every action that refreshed `/dashboard/campaigns` now refreshes the whole section (`revalidatePath(..., "layout")`), so Campaigns live and request pages never show stale data (L6).
- **Withdraw from the request page** redirects back to the list, since the page no longer exists afterwards.
- **Un-ticking "Other"** clears the specify text so a stale value isn't saved. Unknown category values posted to the action are dropped (whitelist).
- **Pre-existing requests** (before 0063) show their single category via the backfill and a code fallback.
- An existing admin bug: the request detail compared the category to `"other"` while the form stores `"Other"`, so "please specify" text never showed. Fixed by the shared helper.
- **Checklist facts are independent.** A pre-event survey published before matching shows as done; the "Next" line is the first unfinished step.

## Decisions to confirm with the client

1. **Who acts on each step.** The checklist says the *artist* sets up discount codes and *our team* publishes the campaign survey (that's how the platform works today: admins publish surveys). The note could be read as "artist publishes the survey". Say if it should read differently.
2. **A campaign keeps one category.** Brands can request several, but the campaign the admin creates still has one (it drives artist-side browsing). Multi-category campaigns would be a further change.
3. **Edit window.** Requests stay editable only while "Submitted"; once the team starts reviewing, changes go through messages. Unchanged from before; confirm that's still wanted.

## Deploy

- Migration 0063 must be applied to the database **before** the code is deployed. The request form writes `categories`.
- This branch also carries the survey changes and migration 0062 (`docs/survey-feedback-2026-10-13-plan.md`); a merge ships both.
- The Supabase project `oalqfzaejflgrtyfrrrb` is the one the live site uses (lessons.md), so "applied to dev" = applied to production.
