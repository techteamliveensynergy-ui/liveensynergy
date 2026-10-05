# Stripe invoicing: setup and testing the full loop

How to switch on Stripe invoices and test the whole thing in **Test mode**, from sending an invoice to the campaign opening, without moving real money. For the design, see `docs/payments-email-implementation-plan.md`.

## How it works

```
Admin "Send invoice" (draft)
  └─ active mode has a verified key?  no → bank-transfer invoice, as before
                                       yes ↓
     Stripe: customer (one per brand per mode, refreshed with billing details)
             invoice  (metadata invoice_id + reference, our lines, VAT 20% tax rate)
             finalise → total must equal ours to the penny, else void + error
             send     → Stripe emails the brand a hosted pay page (card / bank transfer)
     ours:   status sent, Stripe number, pay-page + PDF links; our own email too

Brand pays on Stripe's page
  └─ Stripe → POST /api/webhooks/stripe/<mode>
       signature check (that mode's whsec_) → event recorded once (payment_events)
       invoice.paid      → re-fetch from Stripe, check id/amount/GBP
                           → stripe_mark_invoice_paid(): invoice paid + campaign opened
                           → brand: "invoice paid" + "campaign open"; admins: "invoice paid"
       invoice.payment_failed → brand + admins told
       invoice.voided    → our invoice cancelled
```

Admin buttons on a Stripe invoice:
- **Mark paid** tells Stripe the invoice was paid out of band, so Stripe stops sending reminders.
- **Cancel** voids the invoice in Stripe, so the brand can no longer pay it.
- **Resend** has Stripe email the invoice again, to the brand's current billing email.

Safety rails:
- A test webhook can't act on the live endpoint, and the reverse.
- A **test** payment never opens a campaign while the platform is in **Live** mode.
- A double-clicked **Send** produces one Stripe invoice, not two.

## One-time setup (Test mode)

Do these steps in order. Steps 1–2 need nothing from Stripe.

1. **Apply migrations 0050 → 0053** to the Supabase project, in order. Use the SQL editor and check `docs/database-migrations.md` first. Apply them **before** the code deploys.
2. **Vercel**: make sure `SUPABASE_SERVICE_ROLE_KEY` is set and marked Sensitive.
   - The server needs it to read the Stripe key back out of Vault and to run the webhook.
   - Without it, Send shows "The Stripe key couldn't be read on the server", and the webhook answers 503.
   - Also check `NEXT_PUBLIC_SITE_URL` is the production origin.
   - Redeploy after changing these.
3. **Stripe Dashboard, in Test mode** (toggle top-right, or the sandbox):
   1. **Developers → API keys:** copy the **Secret key** (`sk_test_…`).
      - For testing, the plain test secret key is simplest, because it can't move real money.
      - For **Live**, create a restricted key (`rk_live_…`) with write access to Customers, Invoices (and Invoice items, if listed separately) and Tax rates, plus read access to account details. The key check on our screen reads the account.
   2. **Settings → Payment methods:** turn on **Cards** and **Bank transfers**.
   3. **Settings → Billing → Invoices:** set the payment methods offered on invoices, then upload the logo and brand colour that the hosted page and PDF use.
   4. **Settings → Customer emails:** turn on "Successful payments" if you want Stripe's own receipt as well as ours.
4. **Our app → Admin → Payment settings → Test card:** paste the `sk_test_…` key. It is checked with Stripe before it is saved.
5. **Stripe → Developers → Webhooks → Add endpoint** (Test mode):
   - **URL:** `https://<production-origin>/api/webhooks/stripe/test`.
     - Preview deployments sit behind Vercel's login wall and Stripe can't reach them, so test on the production domain while the active mode is **Test**.
   - **Events:** `invoice.paid`, `invoice.payment_failed`, `invoice.voided`.
   - Copy the **Signing secret** (`whsec_…`) into Admin → Payment settings → Test → Webhook secret.
6. Leave the active mode on **Test**.

## Testing the full loop

1. **Use your own address as the brand's billing email.**
   - In Test mode, Stripe only emails addresses that belong to members of your Stripe account. Use the address you log into Stripe with.
   - Our own "invoice sent" email (via Resend) goes to whatever billing email is set. On non-production deployments it goes to `EMAIL_REDIRECT_TO` instead.
2. **Create a campaign for that brand as admin.** A draft invoice appears.
   - The draft page should say *"Sending goes through Stripe (Test mode)"*.
   - If it says *"Stripe isn't set up"*, the key isn't saved or verified.
3. **Click Send.** Then check:
   - The invoice shows **Sent**, with a *Stripe · Test* chip, a Stripe number, and links to the payment page and the PDF.
   - In Stripe → Invoices, the invoice shows our lines and VAT, and the total matches.
   - If a red banner appears, it contains Stripe's own reason.
4. **As the brand,** open the invoice (Campaigns → Your orders), then click **Pay online** and pay with card `4242 4242 4242 4242` (any future date, any CVC).
5. **Within seconds:**
   - The invoice reads **Paid**, with a "View receipt" link.
   - The campaign moves from *awaiting payment* to open, and appears under artists' Discover campaigns.
   - The brand gets "invoice paid" and "campaign open" notifications; admins get "invoice paid".
   - In Stripe → Webhooks → the endpoint, the event shows **200**.
6. **Failure paths to try:**
   - **Declined card:** `4000 0000 0000 0002` is refused on the page itself. `4000 0000 0000 0341` attaches, then fails; brand and admins are told and the invoice stays unpaid.
   - **Bank transfer:** choose it on the pay page. Stripe shows test bank details; use the Dashboard's "simulate a transfer" on the customer to fund it, and `invoice.paid` follows.
   - **Cancel** a sent invoice in our admin: it shows *Void* in Stripe, and its pay page no longer accepts payment.
   - **Void in the Stripe Dashboard:** ours shows **Cancelled** ("Voided in Stripe").
   - **Mark paid** in our admin on a sent Stripe invoice: Stripe shows it *Paid (out of band)*.
   - **Resend:** Stripe sends the invoice again.
   - **Redeliver a webhook** from the Stripe Dashboard: nothing happens twice. The event is already recorded.

## Troubleshooting

- **Webhook 400 "invalid signature":** the `whsec_` saved in our app isn't the one for *this* endpoint. Each endpoint has its own.
- **Webhook 503:** the webhook secret isn't saved for that mode, or `SUPABASE_SERVICE_ROLE_KEY` is missing in Vercel.
- **Webhook 200 but the invoice isn't paid:** look at `payment_events.error` (Supabase table editor). Common causes:
  - The invoice was created by hand in Stripe, so it isn't one of ours.
  - The amounts differ. It's deliberately not marked paid; check it by hand.
- **Send fails with a permissions error:** the restricted key is missing a permission. Stripe's message names it.

## Going Live (later, after client sign-off)

1. Do the same in Live mode:
   - A restricted `rk_live_` key.
   - The endpoint `…/api/webhooks/stripe/live`, with its own `whsec_`.
2. Turn on **2FA for admins** first. It is listed as required before real money moves.
3. Switch the active mode to **Live** on the Payment settings page.
   - New invoices then go out as Live.
   - Test invoices already sent stay Test, and paying them never opens a campaign.
