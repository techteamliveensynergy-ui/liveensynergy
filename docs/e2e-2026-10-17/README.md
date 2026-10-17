# End-to-end run — 17 Oct 2026

One continuous take of the whole business, every role playing its part
(`tests/e2e-lifecycle.spec.ts`, project `e2e-video`, local production build
against the shared Supabase project). Video: `end-to-end-run.webm` (~9.5 min,
captioned).

| # | Who | Step | Result |
|---|---|---|---|
| 1 | Artist | Lists an event dated today, available to sponsors | ✅ |
| 2 | Admin | Creates the campaign (Starter £2,500) → awaiting payment, invoice drafted | ✅ |
| 3 | Admin | Order form: links the artist's event, sends it to the brand | ✅ |
| 4 | Brand | Reviews, ticks both consents, approves → invoice sent through Stripe (TEST) | ✅ |
| 5 | Admin | Marks the invoice paid → campaign opens | ✅ |
| 6 | Artist | Sees the open campaign, registers interest | ✅ |
| 7 | Admin | Suggests the artist's event | ✅ |
| 8 | Brand, artist | Both agree → sponsorship confirmed | ✅ |
| 9 | Admin | Discount-code tier (20% off, 10 unique codes), sends for review | ✅ |
| 10 | Artist | Confirms the codes | ✅ |
| 11 | Admin | Builds and publishes pre- and post-event surveys | ✅ |
| 12 | Admin | Opens registration | ✅ |
| 13 | New audience member | Signs up, opens the verify-email link, onboards | ✅ |
| 14 | Audience | Registers for the event | ✅ |
| 15 | Audience | Pre-event survey passes → code issued automatically, on My events + My rewards | ✅ |
| 16 | Admin | Random draw selects them; row shows "survey passed" | ✅ (after fix 2) |
| 17 | Audience | Uploads a ticket, checks in by the QR link | ✅ |
| 18 | Audience | Post-event survey; participation ends `reward_released` | ✅ (after fix 1) |
| 19 | Brand, admin | Campaign view, sponsored event, survey results | ✅ |

Paying on Stripe's hosted invoice page works with a test card but is opt-in
(`E2E_STRIPE_UI=1`): the page runs an invisible hCaptcha, and it offers an
Indian visitor INR with a 4% conversion fee first (Stripe Adaptive Pricing —
switch off in the Stripe dashboard if unwanted).

## Defects found and fixed

1. **Rewarded participants never reached `reward_released`.** Since 0075 the
   code goes out on the pre-event pass; checking in afterwards left the row at
   `attendance_verified`, so every "rewarded" count under-counted. Migration
   0079 (applied to production 17 Oct).
2. **Admin row said "survey missing" for someone holding their code.** The
   manual gate (`src/lib/data/reward-gate.ts`) required the post-event survey
   and ignored public-link answers; the automatic issue (0075) accepts any
   passed campaign survey from either. Both now use the 0075 rule.

## Found, not fixed

- Two brands are called "Northwave Coffee" (the QA one and a tester's). The
  admin's brand picker shows names only, and the survey's campaign picker
  shows "CMP-000xx · brand" — easy to pick the wrong one (the second attempt
  of this run did, and was reverted within minutes).

## Test data

Everything the runs created is tagged `E2E 1017…` and has been hidden:
campaigns CMP-00013…00019 closed, sponsored events withdrawn, listings
closed, surveys archived, two unpaid Stripe TEST invoices cancelled (voided in
Stripe). Audience accounts `e2e-…@qa-liveensynergy.co.uk` remain.
