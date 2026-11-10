# 9 November 2026 — QA round fixes

Branch `claude/zen-hopper-y4subp`. One migration: **0115** (apply before deploying).
Terms & Privacy were left out on purpose (waiting on the client's legal text).

| # | Reported | What changed |
|---|---|---|
| 1 | Admin **Decline** on a change request does nothing — stays "Pending", no error, the artist never hears | The decision is now one admin-checked database call (`admin_resolve_change_request`) instead of an unchecked direct update. It only works from Pending, says why when it can't ("already decided", "no longer exists"), tells the requester the decision **and the admin's reply**, and is audited. The buttons show "Declining…" and the result appears right under them. The same visible-result treatment is on **Decline** for cancellation requests. The requester's notification now says "Change request declined/approved" with the reply (it used to say only "Your requested change was reviewed"). |
| 3 | Admin and brand sign-in 7–10 s | Every page load made **two** round trips to the Auth server (middleware + page). The session is now verified locally from its signed token (`getClaims`, Supabase's recommendation; signing keys cached for 10 min). The "last seen" write no longer holds the page. Brand landing read the brand row twice, one after the other, and ran its later lookups in sequence — now one read and one parallel batch. **Region check still recommended** (see below). |
| 4a | Brands have no "What's next" | Brand home has a **What's next** list. Items that need the brand come first: approve an order form, pay an invoice, review a proposed event, read a new survey report. After that comes where each campaign is with the team (e.g. "Our team is lining up the right artist"). Each item links straight to the page. |
| 4b | Brands have no AI report | **Admin publishes a reviewed report** to the campaign's brand ("Publish to brand…" on the report). It needs a linked campaign and at least 5 responses. The brand is emailed. The brand sees it under **Survey reports** on its live campaign, can print or save it as PDF, and can download Word. Brands see the write-up, charts and anonymous quotes, never the admin's instructions, the file name or who answered. The report can be unpublished. |
| 4c | Brands have no Repository upload | Repository → **My files** for brands: upload logos, guidelines and decks with a title and notes, then download, delete, or switch who can open each file: **team only**, or **team + partner artists**. Artists in a partnership with the brand see the shared ones under "Files from your partner brands"; admins see all. |
| 4d | Public events list has no search | `/events` has **search** (event, artist, brand, venue), a **category** filter and **Open for sign-up now**. It's a plain link-able form that works without JavaScript; "No events match" offers to clear. |
| 5 | Priya's event says "Code issued" but next step "team chooses who takes part" | Once a code is issued, no earlier step is shown as "next" (selection, ticket and check-in don't gate the code). The card says "Your discount code is ready — it's under My rewards", and the Overview's "What's next" agrees. |
| — | (not yet tested) blank required survey answers | The website already refused them. The **database** backstop accepted a required answer of only spaces (or an empty selection) sent straight to the API — now refused, matching the app. |

## Testing done

- 0115 on the scratch database built from all migrations (Supabase-style roles and default grants), applied 3×.
  - **Decisions:** a non-admin is refused; decline with a blank reply and approve with a reply both land, and notify with the right wording; deciding twice, a missing request and a bad choice are each refused with a reason; the audit log is written.
  - **Reports:** a brand can't publish; a brand sees nothing before publishing, and can't read the table directly; under 5 responses and no campaign are refused; publishing twice changes nothing; the brand sees the published report with only safe fields; the brand can't open an unpublished one; artists see nothing; the brand is emailed once; unpublishing hides it.
  - **Files:** the brand sees its own; a file in another account's folder is refused; one artist can't add files for another account; the partner artist sees only "partners" files; audience members see none; admins see all; an artist can't change visibility.
  - **Blank answers:** spaces and empty strings are refused for a required question; a real answer is accepted.
  - Verify group L: 6/6 PASS.
- `npm run typecheck` and `npm run build` clean. Production smoke test: public pages and `/events` search render, and the signed-out dashboard still redirects to sign-in (the middleware change runs on every page). Unit check: the participation tracker after a code is issued.
- **Not tested** in a browser against real data or with real email sends. I couldn't read the live database or Vercel logs (access refused), so the exact cause of the original Decline failure couldn't be seen. The new path checks and reports every outcome, so if it fails again, the screen will say why.

## For you

1. Apply **`0115_brand_reports_files_and_change_requests.sql`** before deploying, then run `docs/db-verify-0104-0109.sql` — group L should be all PASS.
2. **Sign-in speed:** after deploying, if admin/brand sign-in is still slow, check that the Vercel Function Region (Settings → Functions) is the same region as Supabase (Project Settings → General). Every remaining database call crosses that distance.

## Browser checks (throwaway data)

1. **Decline** — as the artist, request a change on a confirmed partnership. As the admin, Decline it with and without a reply. "Request declined — the requester has been told" should appear, the badge should turn red, and the artist should get a notification saying declined plus the reply. Repeat with a cancellation request.
2. **Brand What's next** — with an order form sent and an invoice open, brand home lists "Review and approve…" and "Pay invoice…" first, with working buttons.
3. **Report** — admin opens an AI report linked to the brand's campaign (5+ responses) → Publish to brand. The brand gets the email; the live campaign shows Survey reports → Read report / Word.
4. **My files** — the brand uploads a file shared with partners and one team-only. The partner artist sees only the first under Repository; admin sees both.
5. **Events search** — `/events?q=<artist name>` narrows the list; "Open for sign-up now" hides upcoming ones.
6. **Priya** — her "Code issued" event shows "Your discount code is ready" and no "next: team chooses".

---

## Follow-up (10 Nov): the Decline bug's real cause, and where brands find reports

Tester's report: Decline now said "Choose Approve or Decline" and the request stayed Pending. Terms and Privacy are still waiting on the client's legal text.

| Reported | Cause and fix |
|---|---|
| **Decline on change requests still does nothing** | My 9 Nov fix changed the server side, but the problem was in the browser. The form had a hidden field named `id`, and React builds a clicked button's value from `form.id` — which a field called `id` shadows — so `op=decline` never left the browser. That is why the original did nothing too. Reproduced in a real browser against the production build (`op=null`), then fixed by renaming the field to `request_id`: Decline and Approve both reach the server, with or without a reply. I scanned every form in the app for the same combination (a field named `id` plus a named submit button); this was the only one. The reply box is now a multi-line field, because pressing Enter in a one-line box submitted the first button, Approve. Recorded as L12 in `lessons.md` and a note in `CLAUDE.md`. |
| **Brands still don't get an AI report** | The report publishing from 9 Nov was reachable only from a live campaign's page, while brands look under **Reporting & analysis**, which showed totals only. That page now has a **Written survey reports** section at the top (read, print, Word), or a plain explanation when none is published yet. The survey-results page no longer just says "summarised by our team": it links to the published report, or says when it will arrive and that they'll be emailed. A report still appears only after an admin publishes it. |

No new migration. Browser checks: (1) as admin, Decline a change request with and without a reply → "Request declined — the requester has been told", badge turns red, the artist is notified; Approve one too; press Enter in the reply box → it adds a line, doesn't submit. (2) As the brand, Reporting & analysis shows "None published yet" before publishing, and the report with Read/Word after the admin publishes it.
