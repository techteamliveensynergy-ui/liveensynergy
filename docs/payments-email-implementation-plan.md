# Payments (Stripe Invoicing) + transactional email — implementation plan

_Agreed in planning on 1 Oct 2026. Phase A (email) is unblocked; Phase B onward waits on the open decisions in §6._


## Context

Brands pay for the sponsorship packages admins assign them. Today:
- **Brand side:** a brand submits an intake request (`campaign_intake_requests`). An admin converts it into a campaign, choosing the package and budget in `createCampaignFromAdmin` (`src/app/dashboard/admin/marketplace-actions.ts:450`). The campaign is created as `in_progress`, so artists can see and match it straight away, with no payment taken.
- **Invoices:** migration `0031_invoicing.sql` already has an `invoices` table, an admin invoice console (`src/app/dashboard/admin/invoices/*`) and a brand "Your orders" list (`src/app/dashboard/campaigns/page.tsx:161`). But `sendInvoice()` in `src/lib/invoicing.ts` is a stub, the amount is typed in by hand, an admin clicks to mark it paid, and being paid does not change anything else.
- **Email:** every notification is queued into `email_outbox`. Nothing ever sends it. Supabase Auth emails use the built-in mailer, which is capped at a few per hour.

**Decisions taken in this planning session:**
- **Stripe Invoicing.** This is not Stripe Connect. Brands pay by card or UK bank transfer, using a virtual account number per brand that Stripe matches automatically.
- **Invoice creation:** the invoice is drafted automatically when the campaign is created, and an admin reviews it and clicks Send.
- **Payment gate:** the campaign stays hidden from artists until it is paid.
- **VAT status is unconfirmed.** We build proper VAT invoices anyway and keep the VAT settings configurable. **Chosen default (1 Oct): VAT on top of the package price** — Starter £2,500 → £3,000 payable — following the Brand Portal brief ("all pricing exclusive of VAT"); `INVOICE.vatMode` in `src/lib/constants.ts` switches to the alternative (VAT inside the platform fee only). **Open for the accountant:** the seeded package margins (e.g. Starter £378) were computed as £315 + 20% VAT, so under VAT-on-top the VAT embedded in them may be overstated (£63 on Starter); margins and `netForCampaign()` are deliberately untouched until that is answered. VAT on the whole price also assumes the platform supplies the package as principal rather than passing the pool through as agent.

**Outcome:**
- Admin converts the intake. A draft invoice is created automatically. The admin sends it.
- The brand pays on Stripe's hosted page.
- A webhook marks the invoice paid and opens the campaign.
- The brand gets the receipt and an in-app plus email notification.
- All emails are actually delivered, through Resend.

> ⚠️ This reverses the 10 Aug standup decision ("bank transfer only, Stripe rejected", `docs/payments-kyc-strategy.md`). That decision rejected **Connect** because of escrow and holding client money. Invoicing does not need Connect, and **bank transfers can't be charged back**. Even so, the client must sign off. Stripe must also be told about the expected large, irregular payments (for example £5,000 one-offs) when the account is set up, to reduce the risk of a freeze.

**Stripe credentials screen — BUILT (migrations 0050 + 0052, `src/lib/payment-credentials.ts`, `/dashboard/admin/settings/payments`).** **Update (5 Oct):** keys are now stored in **Supabase Vault** (0052) instead of being encrypted in the app under a Vercel master key — the master-key setup blocked first use, and Vault needs no configuration. The §1b text below about AES-256-GCM and `PAYMENT_CREDS_ENCRYPTION_KEY` is superseded; everything else (write-only screen, masks, audit, alerts, Live guard, service-role-only read-back) is unchanged. Deviations from §1b below: **no 2FA step-up yet** (the app has no two-factor login; the user chose to defer it — every change is still verified with Stripe, rate-limited, audited and announced to all admins; **2FA is required before real money flows**); no publishable key (the hosted invoice page doesn't need one); no "remove key" (replace covers rotation); no decrypt cache (decrypting is cheap); verification fails closed — only a real 200 from Stripe counts, because a 403 can come from a proxy (it did in testing). `brand_stripe_customers`, `invoices.stripe_mode` and the "open test invoices block the Live switch" check arrive with Stripe invoicing.

**Stripe invoicing — BUILT, test mode first (migration 0053, `src/lib/invoicing.ts`, `src/lib/stripe.ts`, `/api/webhooks/stripe/[mode]`).** Send creates the invoice in Stripe in the **active** mode when that mode has a verified key (otherwise it falls back to a bank-transfer invoice, as before): our exact lines, VAT as a Stripe "VAT 20% exclusive" tax rate, our reference in metadata and on the PDF; it is finalised, Stripe's total is checked against ours to the penny (voided and refused on a mismatch), then Stripe emails it. Card vs bank transfer is a Stripe Dashboard setting, not code. The webhook (per mode, own signing secret) re-fetches the invoice from Stripe and checks id/amount/currency before marking it paid and opening the campaign; a TEST payment never opens a campaign while the platform is in LIVE mode. Mark paid / Cancel / Resend act on Stripe too (paid out of band / void / re-send). Setup: `docs/stripe-setup.md`. Not built yet: blocking the Live switch while test invoices are still open (the webhook guard above covers the risk), refunds/credit notes, partial payments.

**Invoice statuses + resend — BUILT (migration 0051).** Admin list filters (All / Draft / Unpaid / Overdue / Paid / Cancelled), overdue derived from the due date (`invoiceDisplayStatus()`), resend to the brand's current billing email (throttled per invoice), cancel with a reason (brand told if they had received it), and "Draft a replacement". Sending now emails the billing address rather than the brand's login email.

**Stripe keys are managed from the admin panel**, not from environment variables. Each mode (test and live) has its own set of keys, and an admin chooses which mode is active. Keys are encrypted and can be written but never read back (see §1b).

---

## 1b. Stripe credentials in the admin panel (test / live)

**Screen: `/dashboard/admin/settings/payments`**
- There are two cards, **Test** and **Live**. Each holds:
  - the secret or restricted key
  - the webhook signing secret
  - the publishable key (not secret; kept for future use)
- After saving, a card only ever shows a mask (`rk_live_••••a1b2`), when it was verified, the Stripe account id, and who changed it and when.
- There is no "show key" button. To change a key you **Replace** it, which means pasting the whole value again.
- **Active mode** is a toggle between Test and Live. A banner shows the current mode to all admins, and a "TEST MODE: payments are not real" badge appears on brand invoice pages while test mode is active.

**Storage:**
- **Table `payment_credentials`**, one row per mode:
  - `mode` (test or live), the primary key
  - `secret_key_ct`, `webhook_secret_ct`: the encrypted keys
  - `secret_key_last4`
  - `publishable_key`
  - `stripe_account_id`, `verified_at`
  - `key_version`
  - `updated_by`, `updated_at`
- **Table `payment_settings`**, a single row:
  - `active_mode` (defaults to `test`)
  - `changed_by`, `changed_at`
- **Encryption:** keys are encrypted in the app with **AES-256-GCM** before they reach the database.
  - The master key is `PAYMENT_CREDS_ENCRYPTION_KEY`, stored only in Vercel as a *Sensitive* environment variable.
  - The additional authenticated data is `mode|field|key_version`, so an encrypted value can't be copied into another mode's or field's slot.
  - A leaked database or backup, or someone with access to the Supabase dashboard, therefore sees only encrypted data. Reading the keys needs both the database and the Vercel environment.
- **RLS is turned on with no policies at all, not even an admin read.** Only the service role can touch these tables. Admin screens read the safe metadata through a `security definer` RPC, `payment_credentials_status()`, which checks `is_admin()` and returns mask, verification and audit fields only. It never returns the encrypted values.

**Rules when saving keys** (server action, `requireRole(['admin'])`):
- **The admin must have signed in with MFA.** The action checks Supabase's `aal2` session level. Changing keys or the mode is refused without it.
- **Prefix check:**
  - Test mode accepts only `sk_test_` or `rk_test_`.
  - Live mode accepts only `sk_live_` or `rk_live_`.
  - The webhook secret must start with `whsec_`.
  - A mismatch is rejected. This stops live keys being pasted into the test slot, and the reverse.
- **Live check:** the key is used once to call `stripe.accounts.retrieve()` before saving. If it fails, nothing is saved. The Stripe account id is stored, and the screen warns if the test and live keys belong to different Stripe accounts.
- **Rate limit:** 5 saves per admin per 10 minutes, using the `rate_limit_hit` throttle.
- **Audit and alerts:** each change writes a `payment_settings_audit` row (who, what, when, IP hash; never the value) and notifies every admin with `admin.payment_credentials_changed`.

**Switching to Live** is a deliberate, guarded action:
- It requires live keys that are saved and verified, an MFA session, and typing `LIVE` to confirm.
- The screen lists every **open test-mode invoice**. Each must be voided and re-issued in live mode before the switch, or the switch is refused.
- All admins are notified with `admin.payment_mode_changed`.
- Switching back to Test needs the same MFA and confirmation steps.

**How mode affects the rest of the system:**
- **New invoices** are always created in the *active* mode. Each invoice stores `stripe_mode`, and each Stripe call uses the keys for **that invoice's own mode**, so invoices still in progress are never left without their keys.
- **Stripe customers:** a customer id only exists in one mode, so a new table `brand_stripe_customers` records one id per brand per mode. This replaces the single `stripe_customer_id` column on `brands`.
- **Webhooks:** each mode has its own URL, `/api/webhooks/stripe/test` and `/api/webhooks/stripe/live`. Each checks the signature with its own mode's webhook secret and rejects events whose `livemode` doesn't match the URL.
- **Test payments can never unlock real campaigns on production.** On production (`VERCEL_ENV=production`), when live mode is active, a paid test-mode invoice is recorded but **does not** open a campaign. While test mode is active (QA before launch), test payments do open campaigns, which is the point of test mode.

**Keeping keys from leaking:**
- The module that reads keys, `src/lib/payment-credentials.ts`, starts with `import "server-only"`. A client component that imports it fails at build time.
- No server action returns, logs or echoes a key. The action state returns only `{error?, message?}`, and the form never sends submitted values back. Inputs are `type="password"` with `autoComplete="off"`.
- Stripe errors are mapped to generic messages before they reach the screen. Raw error objects, which can include request details, are never logged.
- Decrypted keys are cached in memory for at most 60 seconds per server instance. The cache key is `mode + updated_at`, so replacing a key takes effect immediately.
- Recommend **restricted keys** (`rk_`) with the minimum permissions listed in §3, rather than full secret keys.
- **Key rotation:** a `key_version` column plus a script re-encrypts every row when `PAYMENT_CREDS_ENCRYPTION_KEY` is rotated.

**What must still live in Vercel's environment, because something has to unlock everything else:**
- `PAYMENT_CREDS_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

The same storage could later hold the Resend key. For v1 it stays an environment variable, since the Vercel Marketplace sets it up automatically.

---

## 1. End-to-end flow

```
Brand intake (submitted)
  → Admin approves → in_review           [NEW notify: brand "request under review"]
  → Admin creates campaign (package/budget fixed server-side)
      campaign.status = awaiting_payment  (NOT visible in open_campaigns)
      invoice auto-drafted: lines from package, VAT computed, status=draft
  → Admin reviews draft → "Send"
      Stripe: customer upsert → invoice create + lines → finalize → send
      invoice.status = sent; stores Stripe number, hosted URL, PDF
      Stripe emails invoice (pay link, bank details) — brand also gets in-app notice
  → Brand pays (card on hosted page, or bank transfer to their virtual account no.)
  → Stripe webhook invoice.paid
      verify signature → dedupe event → re-fetch invoice from Stripe → check amount/currency/livemode
      RPC apply_invoice_payment(): invoice=paid, campaign awaiting_payment→in_progress (atomic)
      notify brand (payment received + receipt link), notify admins
  → Campaign now appears to artists → matching as today
```

**Fallbacks that stay manual:**
- **Mark paid offline:** for money received outside Stripe. The admin enters a reason, and we call `invoices.pay({paid_out_of_band:true})` so Stripe stops sending reminders. It runs through the same RPC as the webhook, so there is only one code path that marks an invoice paid.
- **Waive payment:** for comp or internal campaigns. Needs a reason and is recorded.
- **Void:** cancels the invoice in Stripe as well as in our database.

---

## 2. Gaps and edge cases you hadn't listed (all covered in the plan)

| Case | Handling |
|---|---|
| Admin edits budget or package after the invoice was sent | Money fields are locked while an invoice is open. To change them: void the invoice, edit, then re-issue. If the invoice is already paid: issue a top-up invoice or a refund/credit note, admin only. |
| Campaign cancelled or intake withdrawn after sending | Unpaid: void the invoice and notify the brand. Paid: refund through a Stripe credit note, admin only, with a reason. **Refund policy still needs a client decision.** |
| Brand never pays | Due date defaults to 14 days. Stripe sends reminders, and the `invoice.overdue` webhook notifies the brand and admins. In v1 the campaign is never auto-cancelled; an admin decides. This is the open "unpaid expiry" question from the 10 Aug standup. |
| Partial payment, overpayment, or bank transfer with the wrong reference | Stripe holds the money in the customer's cash balance. We store `amount_paid` and `amount_remaining` and alert admins. The campaign opens only when the invoice is fully paid. |
| Brand pays twice (card and transfer) | The extra lands in the cash balance and triggers an admin alert. Admin refunds it or applies it to the next invoice. |
| Webhooks arrive out of order or are retried | Each Stripe event id is stored under a unique constraint, so a repeat is acknowledged with 200 and ignored. We always re-fetch the invoice from Stripe and act on its current state. Our state only moves forward. |
| Admin double-clicks Send | Every Stripe write carries an idempotency key, `inv_<uuid>_<action>`. The Send button is also disabled while the request is in flight. |
| Card payment fails | `invoice.payment_failed` notifies the brand and tells them to retry or pay by bank transfer. |
| Card chargeback | `charge.dispute.created` sends an urgent alert to admins. The campaign is not reverted automatically. |
| Brand has no billing details | Send is blocked until the brand has billing details: legal company name, billing email (often the accounts team, not the manager), billing address, and an optional VAT number. These are added to the brand profile form. |
| Non-UK brand | Show a "VAT treatment needs review" warning. Reverse charge is a question for the accountant. |
| Existing live campaigns | Left untouched. They stay `in_progress` and don't need an invoice. No backfill needed. |
| Test events reaching the live site | Reject any event whose `livemode` doesn't match the environment. Test mode and live mode use different keys and different webhook secrets. |
| Rounding of amounts | All amounts are calculated in whole pence and passed to Stripe as integers. Uses the existing `roundMoney` helpers. |
| Package margins stored including VAT, but the brand portal says prices exclude VAT | This is already inconsistent in `0024`. **The accountant must say which parts carry VAT.** The invoice is built from typed lines: `platform_fee` (VAT 20%) and `sponsorship_pool` (pass-through, no VAT, per the strategy doc). Changing the treatment is a configuration change, not a rewrite. |
| Legal invoice numbering | Stripe's account-level sequential number (for example `LES-0001`) becomes the legal invoice number. Our `INV-XXXXXXXX` stays as an internal reference. |
| Notification fired from the webhook | The webhook has no signed-in user, so `notify()` and `enqueue_notification` (currently granted only to `authenticated`) would fail silently. Fix: `notify()` accepts an optional client, and we grant the RPC to `service_role`. **Without this fix, every webhook-triggered notification is silently lost.** |
| Brand-supplied text in HTML emails | Every `{{token}}` is HTML-escaped when rendering HTML. A brand name like `<a href=evil>` must not become a phishing link. |
| Bounced or spam-flagged emails | The Resend webhook adds the address to `email_suppressions`, and the sender skips suppressed addresses. |

**New notification events** (each needs the event, settings and template rows in a migration):
- **Brand:**
  - `campaign_intake.in_review`
  - `invoice.sent`: exists, now with `{{pay_link}}`, `{{due_date}}` and `{{amount}}`
  - `invoice.paid`: exists, now with `{{receipt_link}}`
  - `invoice.overdue`
  - `invoice.payment_failed`
  - `invoice.voided`
  - `invoice.refunded`
  - `campaign.payment_confirmed`: tells the brand their campaign is now live to artists
- **Admins:**
  - `admin.invoice_paid`
  - `admin.invoice_overdue`
  - `admin.payment_mismatch`: partial payment, overpayment or unmatched transfer
  - `admin.payment_dispute`
  - `admin.webhook_failure`: event processing failed repeatedly

**Avoiding duplicate emails:** Stripe sends the legal documents (the invoice, reminders and the receipt). For the brand events `invoice.sent` and `invoice.paid`, the app sends the **in-app notification only**; their email toggles default to off in `notification_settings`. All other events are emailed by us through Resend.

---

## 3. Security

**Webhook endpoint `src/app/api/webhooks/stripe/[mode]/route.ts`** (`mode` is `test` or `live`; any other value returns 404):
- Set `runtime = "nodejs"` and read the raw body with `await req.text()`. Verify it with `stripe.webhooks.constructEvent(body, sig, <that mode's webhook secret, decrypted from payment_credentials>)`. This checks the HMAC and a 5-minute timestamp window, which blocks replays.
- An invalid signature returns 400 before any database work.
- Insert into `payment_events` (unique `stripe_event_id`). If the row already exists, return 200 and do nothing.
- **Never trust the payload.** Re-fetch the object through the Stripe API. Then check:
  - `metadata.invoice_id` belongs to our row
  - `stripe_invoice_id` matches
  - the currency is GBP
  - the amount paid equals the invoice total
  - `livemode` matches the environment
- Make all database changes through a `security definer` RPC, `apply_invoice_payment()`, that only `service_role` may execute. It runs as one transaction.
- On an unexpected error, return 500 so Stripe retries (it does so for about 3 days). After N failures, alert admins.
- Exclude `/api/webhooks/*` and `/api/cron/*` from the `src/middleware.ts` matcher, so Supabase session code never runs on these routes and never redirects them.

**Keys and secrets** (full design in §1b):
- Use a Stripe **restricted key** (`rk_…`) with write access to Customers, Invoices, Invoice Items and Credit Notes, and read access to Charges and Account. Do not use the full secret key.
- Test and live keys are entered separately in the admin panel, encrypted with AES-256-GCM, and can't be read back.
- Nothing payment-related goes in a `NEXT_PUBLIC_` variable. Add `import "server-only"` to `src/lib/stripe.ts` and `src/lib/payment-credentials.ts`.
- Use a dedicated service-role helper only in the webhook and cron routes. The existing `createAdminClient` comment says to use it for one operation only; replace that with a scoped `createServiceClient()` used in those routes alone.

**Card data never touches us.** The brand pays on Stripe's hosted invoice page, which keeps us in the lightest PCI scope (SAQ A).

**Brands can't change amounts.** Totals are calculated on the server from the campaign and package (`resolveCampaignMoney`). The existing RLS policy already means only admins can write to `invoices`.

**Admin hardening:**
- Turn on Supabase MFA for admin accounts, since admins can mark invoices paid, waive them and issue refunds.
- Turn on 2FA for the Stripe dashboard.
- Record every mark-paid, waive, void and refund with the admin's id and a reason.

**Rate limiting.** Apply it where it actually protects something:
- **Vercel Firewall rate-limit rules:**
  - `/auth/*` (sign-in, sign-up, password reset)
  - `/api/*` as a backstop
  - `/contact`
- **Supabase Auth's own rate limits:** configure them in the dashboard.
- **A generic app-level throttle** (`rate_limit_hit(key, window, max)` RPC, same pattern as `survey_submission_gate` in 0034) for user-triggered side effects:
  - "resend invoice"
  - "update billing details"
  - feedback and contact submissions
- **The Stripe webhook is not rate-limited by IP.** Stripe sends bursts. Signature checking is what protects it, and it rejects bad requests cheaply.
- **Optional:** allow only Stripe's published webhook IP addresses in the Vercel Firewall.

**Cron route:** require `Authorization: Bearer ${CRON_SECRET}`. Vercel Cron sends this header automatically.

---

## 4. Email delivery (Resend)

This follows `docs/email-branding-research.md`, Phase 0.

**Provider:** Resend, added through the Vercel Marketplace. Send from a subdomain such as `mail.liveensynergy.com`, with SPF, DKIM and a DMARC record. Start DMARC at `p=none`, then move to `quarantine` after about two weeks of clean reports.

**Sending:**
- **Immediate:** after `enqueue_notification`, `notify()` schedules the send with Next 15 `after()`, so emails go out within seconds without slowing the user's action.
- **Sweeper:** a Vercel Cron job hits `/api/cron/drain-outbox` every 5 minutes. This needs Vercel Pro; on Hobby, use Supabase `pg_cron` + `pg_net` calling the same route.
  - It claims rows with the `claim_outbox_batch(n)` RPC (`for update skip locked`).
  - Failed sends are retried with exponential backoff, up to 5 attempts, then marked `failed`.
  - Resend's `Idempotency-Key` is set to the outbox row id, so a retry can never send the same email twice.

**Templates:**
- One React Email layout (`src/lib/email/Layout.tsx`) with the platform logo and footer, using tables and inline styles.
- It wraps the admin-editable plain-text body, which stays as it is today. Tokens are HTML-escaped.
- The plain-text version is sent alongside the HTML.

**Resend webhook (`/api/webhooks/resend`):**
- Verify the Svix signature.
- `email.bounced` and `email.complained`: add the address to `email_suppressions` and mark the outbox row.
- `delivered`: store it, so the admin outbox page can show delivery status.

**Supabase Auth emails:** custom SMTP through Resend (see §7).

---

## 5. Implementation phases and files

**Phase A: email infrastructure — BUILT (migration 0046, `src/lib/email/*`, `docs/email-setup.md`).** Ships on its own and is a prerequisite for payments. Deviations from the sketch below: Resend is called with plain `fetch` (no SDK, so we control the `Idempotency-Key`), the Svix signature is checked with `node:crypto`, and the HTML layout is a small string renderer rather than React Email (bodies are admin-edited plain text) — so no `resend`/`@react-email/components`/`svix` packages, only `server-only`. The project is on **Vercel Hobby**, so the sweeper is Supabase `pg_cron` + `pg_net` calling the route, not `vercel.json`. The pre-provider backlog is marked `skipped`, not sent.
- **Migration `0046_email_delivery.sql`:**
  - `email_outbox` gains `attempts`, `next_attempt_at` and `last_error_at`
  - new `email_suppressions` table
  - `claim_outbox_batch` and `mark_outbox_result` RPCs (service_role only)
  - `grant execute on enqueue_notification to service_role`
- **New code:**
  - `src/lib/email/send.ts`
  - `src/lib/email/Layout.tsx`
  - `src/app/api/cron/drain-outbox/route.ts`
  - `src/app/api/webhooks/resend/route.ts`
  - `vercel.json` (crons)
- **Edits:**
  - `src/lib/notifications.ts`: optional client parameter, `after()` send, HTML escaping
  - the admin outbox page: show attempts and delivery status
- **Packages:** `resend`, `@react-email/components`, `svix`

**Phase B: billing data and invoice creation.** *First slice BUILT (migration 0047, `src/lib/billing.ts`, `billing-server.ts`): brand billing details, auto-drafted VAT-itemised invoices, billing-gated Send, brand invoice view. Deviations from the sketch: line items are a `lines jsonb` column on `invoices` (atomic with the row), not an `invoice_lines` table; Send requires complete billing details for every invoice (no `manager_email` fallback). *Second slice BUILT (migrations 0048/0049): the `awaiting_payment` gate — admin-created campaigns start hidden and open via `mark_invoice_paid()` or a reasoned `waive_campaign_payment()`, backed by a `sponsored_events` insert trigger; the brand's `campaigns` update policy is now admin-only (it let a brand write its own `status`). The brand-facing event is `campaign.opened` (not `campaign.payment_confirmed`, since a waiver isn't a payment). Still to build: Stripe, webhooks, admin-managed credentials, refunds. Unpaid campaigns are never auto-cancelled (the open "unpaid expiry" question) — an admin closes or waives them.*
- **Migration `0047_campaign_awaiting_payment.sql`:** only `alter type campaign_status add value 'awaiting_payment'`. It must be its own migration, because a new enum value can't be used in the same transaction that adds it.
- **Migration `0048_stripe_invoicing.sql`:**
  - **`brands`** gains: `billing_legal_name`, `billing_email`, `billing_address_line1` and `billing_address_line2`, `billing_city`, `billing_postcode`, `billing_country` (default `'GB'`), `vat_number`.
  - **New `brand_stripe_customers` table:** `brand_id`, `mode`, `stripe_customer_id`, with a unique key on (brand_id, mode).
  - **New credential tables (§1b):** `payment_credentials`, `payment_settings`, `payment_settings_audit`. RLS is on with no policies. Plus the `payment_credentials_status()` RPC, which checks `is_admin()` and returns safe metadata only.
  - **`invoices`** also gains `stripe_mode` (test or live).
  - **`invoices`** gains:
    - Stripe references: `stripe_invoice_id` (unique), `stripe_invoice_number`
    - Links: `hosted_invoice_url`, `invoice_pdf_url`, `receipt_url`
    - Amounts: `subtotal_gbp`, `vat_gbp`, `amount_paid_gbp`, `amount_remaining_gbp`
    - Outcome fields:
      - `paid_source`: `stripe`, `manual` or `waived`
      - `waived_reason`
      - `voided_at`
      - `refunded_gbp`
    - Rule: `amount_gbp` stays as the gross total.
  - **New `invoice_lines` table:** `kind`, `description`, `quantity`, `unit_amount_gbp`, `vat_rate`.
  - **Partial unique index:** at most one open invoice per campaign, where open means status is draft, sent or overdue.
  - **New `payment_events` table:** `stripe_event_id` (unique), `type`, `livemode`, `payload jsonb`, `processed_at`, `error`, `attempts`. Admins can read it.
  - **RPCs:** `apply_invoice_payment` and `apply_invoice_status` (service_role only), plus `rate_limit_hit`.
  - **Notification rows:** the new events listed in §2.
  - Check that the `open_campaigns` view filters to `status = 'in_progress'` (so `awaiting_payment` campaigns are hidden), and redeclare it if it doesn't.
- **New `src/lib/billing.ts`:** a pure function, `buildInvoiceLines(campaign, package)`, that works in pence. The VAT treatment of each line kind comes from constants in `src/lib/constants.ts`, next to `PLATFORM_FEE`.
- **New `src/lib/payment-credentials.ts`** (server-only): AES-256-GCM `encrypt`/`decrypt`, `getCredentials(mode)` with the 60-second cache, and `getActiveMode()`.
- **New `src/lib/stripe.ts`** (server-only): `stripeFor(mode)` builds a client from the decrypted key for that mode. Nothing reads Stripe keys from `process.env`.
- **New admin screen `src/app/dashboard/admin/settings/payments/`**, with `page.tsx`, `CredentialsForm.tsx` and `actions.ts` for save, verify and set mode. It does the MFA (`aal2`) check, the prefix check, the live call to `accounts.retrieve`, rate limiting and the audit row. Add it to the admin nav in `src/lib/dashboard-nav.ts`.
- **`src/lib/invoicing.ts`:** replace the stub body with a real implementation. The seam is kept, as its TODO intended. It will:
  - create or update the Stripe customer
  - create the invoice with `collection_method=send_invoice` and `days_until_due=14`
  - set `payment_settings.payment_method_types=['customer_balance','card']` with `gb_bank_transfer` as the bank transfer type
  - add the invoice lines and `metadata.invoice_id`
  - finalize the invoice, then send it
- **`marketplace-actions.ts`:**
  - `createCampaignFromAdmin`: insert the campaign as `awaiting_payment` and auto-draft the invoice
  - `matchCampaign` and `setCampaignStatus`: refuse a campaign that is `awaiting_payment` unless it is paid or waived
  - `updateCampaignAdmin`: lock the money fields while an invoice is open
  - `reviewCampaignIntake` approve: notify the brand with `campaign_intake.in_review`
- **`admin/invoices/actions.ts`:**
  - Send goes through Stripe
  - mark-paid uses Stripe's `paid_out_of_band` and then the RPC
  - void goes through Stripe and notifies the brand
  - add waive and refund actions
  - each action calls `revalidatePath` for the routes it changed (L6)
- **Brand UI:**
  - billing fields in the brand onboarding and profile form
  - "Your orders" shows the status, a **Pay invoice** button (the hosted URL), and links to the PDF and receipt
  - the campaign list shows an "Awaiting payment" badge

**Phase C: webhook and reconciliation.**
- **`src/app/api/webhooks/stripe/[mode]/route.ts` handles:**
  - `invoice.finalized`, `invoice.sent`, `invoice.paid`
  - `invoice.payment_failed`, `invoice.overdue`
  - `invoice.voided`, `invoice.marked_uncollectible`
  - `charge.refunded` and `credit_note.created`
  - `charge.dispute.created`
  - `customer_cash_balance_transaction.created`: alerts on mismatched payments
- **New admin page `src/app/dashboard/admin/payments/`:** a log of payment events, any that failed, and a "re-process" button.

**Phase D: refunds and polish.** Credit-note refunds driven by the agreed refund policy, and an artist-facing receipt view where relevant.

**Docs, in the same commits:**
- `docs/payments-kyc-strategy.md`: record the decision reversal
- `docs/PLATFORM.md`
- `docs/database-migrations.md`
- `.env.example`
- `CLAUDE.md`: Stripe, Resend and cron sections

**New environment variables.** Stripe keys are **not** among them; admins enter those in the panel (§1b).
- ~~`PAYMENT_CREDS_ENCRYPTION_KEY`~~ — **no longer needed** (5 Oct): Stripe keys are stored in Supabase Vault (migration 0052).
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `EMAIL_FROM`
- `CRON_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`: now actually needed in Vercel
- `INVOICE_VAT_NUMBER`: optional until VAT registration

---

## 6. Open decisions (needed from the client or accountant before Phase B ships)

1. **Client sign-off** on Stripe Invoicing reversing the 10 Aug decision.
2. **VAT:** is the business registered? Is VAT charged on the whole package price or only on the platform margin? How should non-UK brands be treated?
3. **Card payments:** enable them, or bank transfer only? Card fees on a £5,000 invoice are significant; bank transfers are cheap and can't be charged back.
4. **Refund policy:** when a paid campaign is cancelled, refund in full, refund minus the fee, or don't refund?
5. **Payment terms:** 14 days? And what happens to a campaign that stays overdue?

---

## 7. What you need to do outside the code

**Supabase**
1. Apply migrations 0046 → 0048 in order **before** pushing the code that uses them (the `lessons.md` checklist). Log each one in `docs/database-migrations.md`.
2. Under Auth → SMTP Settings, turn on custom SMTP:
   - host: `smtp.resend.com`
   - port: `465`
   - user: `resend`
   - password: the Resend API key
   - sender: `no-reply@mail.<domain>`
3. Under Auth → Rate Limits, raise the email send limit (it starts at about 30 per hour with custom SMTP).
4. Under Auth → URL Configuration, set the Site URL to the production origin and allow-list the redirect URLs (L5).
5. Under Auth → Email Templates, brand the confirmation and reset emails.
6. Turn on MFA (TOTP) and enforce it for admin accounts.
7. Copy the service-role key into Vercel as a server-only variable.

**Stripe**
- Create the account under the correct legal entity. Complete business verification, and declare the expected payment sizes.
- Under Settings → Invoices: set the number prefix and sequence, the footer (company number, VAT number when you have one) and the default payment terms. Turn on the invoice reminder emails and successful-payment receipts.
- Under Branding, add the logo and colours.
- Under Payment methods, turn on bank transfer (GBP customer balance) and card, if decided.
- Create a restricted API key in **both** test and live mode.
- Under Developers → Webhooks, in test mode add `https://<prod-origin>/api/webhooks/stripe/test`, and in live mode add `.../api/webhooks/stripe/live`. Subscribe each only to the events listed in Phase C.
- Paste each key and webhook signing secret into **Admin → Settings → Payments** under the matching card. Leave the active mode on **Test** until QA passes, then switch to **Live**.
- Delete the copies from wherever you pasted them from. They should exist only in Stripe and, encrypted, in our database.
- Turn on 2FA for every dashboard user.

**Resend / DNS:** install Resend from the Vercel Marketplace, verify the sending domain (SPF, DKIM, DMARC), and add the webhook endpoint `/api/webhooks/resend`.

**Vercel:**
- Set all the environment variables from §5 per environment.
- Turn on Firewall rate-limit rules for `/auth/*`, `/api/*` and `/contact`.
- Confirm the plan supports a 5-minute cron (Pro).

---

## 8. Verification

- Run `npm run typecheck` and `npm run build` (build catches errors at the server/client boundary).
- **Local webhooks:** run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and use Stripe test mode end to end:
  - Admin converts the intake. The campaign shows as **Awaiting payment** and the artist can't see it in discovery. A draft invoice exists with the right lines and VAT.
  - Send. The invoice is in Stripe, and the brand sees **Pay invoice**.
  - Pay with test card `4242…`. The webhook marks it paid, the campaign becomes `in_progress`, the artist can now see it, and the brand gets the receipt link plus notifications.
  - Bank-transfer path: simulate it with `stripe.testHelpers.customers.fundCashBalance`. Test the exact amount, an underpayment (the campaign stays closed and admins are alerted) and an overpayment.
  - `stripe events resend <id>` (a duplicate) has exactly one effect.
  - A request with a tampered signature returns 400.
  - A test-mode event sent to a live-mode endpoint is rejected.
  - Card `4000 0000 0000 0341` fails, and the `payment_failed` notification arrives.
- **Credentials screen:**
  - Pasting a live key into the Test card is rejected, and so is a bad key, which fails the `accounts.retrieve` call.
  - After saving, the page HTML, the server action response and the server logs contain only the mask. Search the network tab and the Vercel logs for `sk_` and `rk_`.
  - A brand account, and a signed-in admin, querying `payment_credentials` directly through the Supabase client get zero rows.
  - An admin without MFA can't save or switch mode.
  - Switching to Live with an open test invoice is refused.
  - Switching to Live, then paying an old test invoice, does not open the campaign.
  - Every change leaves an audit row and sends the admin notification.
- **Email:**
  - A queued row is sent within seconds.
  - Kill the send, and the cron retries it. Run the same row twice, and Resend's idempotency means one email.
  - A bounce on a test address adds it to the suppression list.
  - Sign up, and the Supabase confirmation email arrives through Resend.
- **Playwright:** the s0810-admin and s0810-brand projects, against `npm run start`.
- **Scoping:** a second brand account can't see the other brand's invoices or pay links (lessons 3b and 3c).
