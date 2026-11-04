# Standup 2 Nov 2026 — tracker

Source: Gemini notes for the 2 Nov daily standup, plus Sakshi's "Artist / Event
Portal" Google Doc (the fulfilment form spec, last edited 2 Nov).

| # | Item | Status |
|---|------|--------|
| 1 | Social-media proof requirements (what the artist must upload, minimum count; each proof tied to an agreed channel) | Built — migration 0103; admin editor + artist view + channel picker on the proof upload |
| 2 | Prefilled promotional commitments — channels (presets + several names), post count, handles/URLs, start date, post texts, other requirements, with the four "Promotional confirmations" from the doc | Built — wording is verbatim from the doc's screenshot (`src/lib/fulfilment.ts`) |
| 3 | Multiple names + special terms set by admin | Built — "Other agreed channels" (one per line) and "Any other special terms" |
| 4 | Invoice upload, payment terms, final consent | Built — invoice history kept, admin marks received/paid/rejected; final consent links T&C + Privacy and is written to the consent log. **Payment terms wording still needed from Sakshi** — the field is empty until the team writes it |
| 5 | "Waiting for fulfilment" event status | Built — badge on the partnered-events lists, event page headers and admin lists |
| 6 | Events go live automatically when the artist completes the form | Built — the gate is in the database (public page, "Live now" list, audience visibility, registration). Admin can put an event live with a written reason, or reopen it |
| 7 | Keep events off the public site; brands enquire through the team | Built — `/events` lists only live research events; the public sponsorship-listing grid and the "upcoming events" block on public profiles are gone; anonymous read of `event_listings` is closed in 0103 |
| 8 | Unpublish and download limits for partner events | **Not built — spec unclear.** See the open question in the PR |
| 9 | Extra consent under the discount codes (doc, first screenshot) | Built — two more ticks beside "I agree to honour them" |
| 11 | Survey quota: alert at 100% of expected participants, a pop-up when submitting, and an email when it's reached (10% buffer keeps accepting) | Built — migration 0104 + page notice + submit pop-up in both survey forms + public event page note. Email goes to **admins**; the 90% stage still has no email |
| 10 | Message Sakshi when fulfilment is live; walkthrough video of admin setup | Drafts prepared, not sent — they wait for the migration to be applied and the deploy |

Also in the notes, not actioned: prompting surveys at 90% completion risks
lowering response quality (a discussion point); moving the next meeting to
Thursday because of Diwali.
