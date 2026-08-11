# Payments, KYC and payouts — the agreed approach

Source: 10 Aug 2026 standup (Sakshi's payment research + the decisions taken in
the meeting). Written up as the reference for what gets built when payments
come in — **none of this is implemented yet**; the platform currently records
budgets and reward amounts as numbers and moves no money.

---

## 1. The decision, in one paragraph

Money **does not sit on the platform**. A sponsor pays their budget in by direct
bank transfer; identity and anti-money-laundering checks run through **Stripe
Identity**; rewards go out through **Wise**. Stripe Connect Express — the
obvious default — was rejected, and the reasons matter more than the choice.

---

## 2. Why not Stripe Connect Express

Three problems, in the order they'd bite us:

| Risk | What it looks like in practice |
|---|---|
| **Account freezing on anomalies** | Sponsorships are lumpy and large: a new account with almost no history takes a single £8,000 payment. That's exactly the pattern automated risk scoring flags, and a freeze doesn't just delay one payment — it stops the platform. |
| **No escrow** | The model needs the sponsor's money to be committed *before* an event goes live and released to audience members *after* attendance is verified. Connect has no escrow product; holding funds in a platform balance to fake one is precisely what the compliance rules below are about. |
| **Holding client money** | Holding other people's money for weeks between payment and payout puts us near e-money / payment-institution territory. Avoiding it is cheaper than qualifying for it. |

## 3. What replaces it

**In: direct bank transfer.** The sponsor pays their budget to the
Live·En·Synergy account against an invoice quoting the sponsorship reference.
Confirmation of that payment is the trigger for everything downstream
(§5).

**Identity: Stripe Identity**, ~£1.25 per verification. Used for KYC/AML on the
parties who receive money — artists, organisers and audience members claiming a
reward — not on every sign-up. It's a verification product only; no funds flow
through it, so none of the Connect risks apply.

**Out: Wise.** Payouts to artists and to audience members. Cheaper than the
alternatives at our volumes, handles multi-currency, and — the point — it's a
transfer rail rather than a balance we sit on. Bank details are collected and
**validated through the API** at the point of onboarding rather than typed in
and hoped for, so a payout doesn't fail on a mistyped sort code.

## 4. The commercial model

| Item | Value | VAT |
|---|---|---|
| Platform commission | 9% of the sponsorship budget | **Yes** — VAT applies to the fee |
| Minimum commission | £315 | Yes |
| Per-payout charge | £2.50 per payout | Yes |
| The sponsorship pool itself | The remainder | **No** — pass-through, not our revenue |

Two things follow from that VAT split, and both are already true in the code:

- `computePlatformFee()` in `src/lib/constants.ts` charges the greater of £315
  or 9%, plus 20% VAT.
- `netSponsorshipBudget()` is what every "available for rewards" figure is
  derived from — gross budget minus the fee inc VAT. Fixed in the 3 Aug batch;
  see item 17 of `docs/standup-2026-08-03-tracker.md`.

**Not yet in the code:** the £2.50 per-payout charge. It needs a decision on
who pays it — whether it comes out of the reward pool (so the sponsor funds it)
or off the recipient's payment (so the audience member does). That changes the
arithmetic on "people this can sponsor", so it isn't a cosmetic addition. See
§7.

**Unspent pool money** is refundable to the sponsor or rollable into a future
event. Today the remaining balance is simply a number on the sponsorship that
stops going down; there's no refund flow.

## 5. Event listings go live on payment

Agreed: **an event listing goes live only once payment has been received and
confirmed**, driven by a webhook rather than someone remembering to flip a
status.

Mapped onto what exists today:

- The status ladder is `in_progress → confirmed → completed`, plus the terminal
  `withdrawn`. Both parties agreeing moves a sponsorship to `confirmed`
  (`agree_to_sponsorship`, migration 0022).
- Under this model, agreement alone stops being enough: **confirmed** should
  mean *agreed and paid*. That's either a new status between the two, or a
  `paid_at` timestamp that the "go live" gate reads.
- The webhook receiver is a route handler that marks payment received and then
  runs the same transition the admin console runs today. Vercel Functions
  handle webhooks natively; no separate service.

Open question for the build: does an unpaid-but-agreed sponsorship expire, and
after how long? Nothing currently reclaims a listing from a deal that stalls
after agreement.

## 6. What this means for the build, in order

1. **Bank details on the profile.** Collected and API-validated for artists,
   organisers and audience members. Nothing on any role table holds them today;
   `participations.bank_details_provided` is a consent checkbox, not an account
   number. This is the first thing needed and the one with the most privacy
   weight — bank details are not going in a table the way a phone number is.
2. **Stripe Identity verification**, stored per profile with its status and
   date. Gate reward release on a verified recipient.
3. **Invoice + payment reference** per sponsorship, quoting the existing
   `SPE-00001` reference so a bank transfer can be reconciled.
4. **Payment webhook → status transition** (§5).
5. **Wise payout call** on reward release, replacing the current
   "admin types an amount, we record it" step in `adminUpdateParticipation`.
   The amount already draws down `remaining_budget_gbp`; what's missing is the
   transfer.
6. **Refund / rollover** of an unspent pool at completion.

## 7. Still to decide

| Question | Why it blocks something |
|---|---|
| Who absorbs the **£2.50 per payout** — the sponsor's pool or the recipient? | Changes `netSponsorshipBudget()` and every "people this can sponsor" figure. |
| Is Stripe Identity run on **all payees**, or only above a threshold? | At ~£1.25 a check, verifying every audience member who claims a £25 reward is a real cost against a small payout. |
| What happens to a sponsorship **agreed but never paid**? | Its listing is held off the market indefinitely today. |
| Which **legal entity and bank account** receives sponsor payments, and who reconciles them? | Determines whether reconciliation can be automated at all in V1, or stays a manual admin step. |
| VAT registration status and invoice numbering | The code applies 20% VAT to the fee already; invoices need a compliant sequence. |

## 8. What isn't changing

Rewards are still released **by the admin team only** (3 Aug standup) and only
after attendance is verified. Selection is a **random draw** run by the team
(10 Aug standup). Payments change how the money moves, not who decides it
moves.
