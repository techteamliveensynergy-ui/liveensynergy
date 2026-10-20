# Artist / Organiser Fulfilment Form

Source: 19 Oct standup and the "Artist / Event Portal" brief (20 Oct).
Migration: `0082_artist_fulfilment_form.sql`.

The brand side of a campaign ends with the Campaign Order Form (0054). This is
the artist's side, so the loop is complete:

```
brand approves order form → pays → team matches the event (sponsored event)
  → team pre-fills + sends the fulfilment form → artist confirms codes,
    reviews commitments, submits → proofs + invoice after the event → payment
```

## Who does what

| Step | Who | Where |
|---|---|---|
| Pre-fill codes deadline, promotional commitments, special terms, payment terms | Admin | Admin → sponsored event → **Artist / organiser fulfilment form** |
| Send (emails the artist, `fulfilment.sent`) | Admin | same card, **Send to artist** |
| Confirm discount codes (+ the new redemption-notice consent) | Artist | Sponsored event page, codes section |
| Request changes (free-text note) | Artist | end of the form |
| Tick the 2 promotional confirmations + Terms & Privacy, add payment details, submit | Artist | end of the form |
| Upload proof of social media (several files and/or a post link) | Artist | proofs section, any time |
| Upload invoice / update payment details | Artist | payment section, any time after sending |
| Reopen for editing (clears the artist's ticks; keeps payment details, invoices, consent log) | Admin | the card's **Reopen for editing** |

Progress shows in the admin **Live campaign** panel and the campaign **Status**
checklist (campaign page and campaigns list).

## The artist's page, in the brief's order

1. Your details — live from their artist / organiser profile (link to edit).
2. Event details — live from the sponsored event / listing.
3. Reward engine · discount codes — moved above; deadline shown, overdue in red;
   second consent: *"LES will be informed promptly of any redemption problems,
   restrictions or changes affecting the codes."*
4. Promotional commitments — read-only (pre-filled by LES).
5. Any other special terms.
6. Proof of social media & terms — multiple files per upload + optional link.
7. Terms of payment — payment details + invoice uploads.
8. Confirm and submit — two promotional confirmations + *"I/We agree to the
   Terms & Conditions and Privacy Policy"*.

Artists without a sent form (older events, or a draft still with the team) see
the page as before, with codes now above proofs.

## Decisions taken (flag any that should change)

- **One form per sponsored event**, created by the admin from the event page
  (not automatically) — sponsored events only exist after payment and
  matching, which is the "after the brand signs" moment.
- **Codes deadline** defaults to 7 days from *sending* (a draft can sit with
  the team); the admin can set any date.
- **Codes confirmation stays its own step** inside the form (it gates code
  release in 0075). The form can be submitted before codes are confirmed;
  the page and the admin checklist flag it.
- **Brand cannot see the form** — it holds payment details. Commitments the
  brand should see can be added to a brand view later.
- **Payment details** are free text (account name / sort code / number, or
  other instructions), visible only to the artist and admins.
- **Editing after sending** goes through *Reopen*, so an artist never ticks
  boxes against terms that changed underneath them.

## Open questions for the client

1. Should the deadline also trigger reminder emails (e.g. 2 days before and on
   the day)? Not built — needs a scheduled job.
2. Should the brand see the agreed promotional commitments and proofs?
3. Final artist T&Cs wording (Sakshi drafting) — the consent links to
   `/terms#artist` and `/privacy` and records `TERMS_VERSION`.
4. Is payment always a single amount, or upfront + remainder (the hidden
   artist-split UI)? Today the terms are free text.
