# Email delivery — setup & operations

How outbound email works, and the one-time setup to switch it on. Design and
rationale: `docs/payments-email-implementation-plan.md` (Phase A).

## How it works

```
notify() ──► enqueue_notification() ──► email_outbox row (status = queued)
   │
   └─ after(): drainOutbox({limit:10})     sends within seconds of the request
pg_cron every 5 min ─► GET /api/cron/drain-outbox   retry sweeper (limit 25)

drainOutbox: claim_outbox_batch()  (for update skip locked, attempts+1)
  → suppressed address?   skipped
  → Resend POST, Idempotency-Key = outbox row id
       ok          sent  (+ provider_message_id)
       400/401/403/422     failed  (won't fix itself)
       429 / 409 / 5xx / network   queued again, wait 2/4/8/16 min, max 5 attempts
Resend webhook ─► /api/webhooks/resend  (Svix-verified)
       delivered / bounced / complained / delayed → email_outbox.delivery_status
       bounced + complained → email_suppressions (never mailed again)
```

Safety properties worth knowing:

- **No double sends.** Workers claim rows with `skip locked`, and the outbox id
  is the Resend `Idempotency-Key`, so a retry after a crash is a no-op at Resend.
- **Nothing reaches real addresses outside production.** If `VERCEL_ENV` isn't
  `production`, mail goes only to `EMAIL_REDIRECT_TO` (subject prefixed
  `[preview → original@address]`); with that unset, nothing is sent and rows
  stay queued. Preview deployments and local dev run against data with invented
  addresses — bounces from those would damage the sending domain's reputation.
- **Not configured = inert.** Without `RESEND_API_KEY`, `EMAIL_FROM` or
  `SUPABASE_SERVICE_ROLE_KEY`, nothing is sent and nothing breaks.
- **HTML is safe.** The admin-edited plain-text body is HTML-escaped first, and
  only URLs on `NEXT_PUBLIC_SITE_URL`'s own origin become links.
- **Old backlog is not sent.** Migration 0046 marks everything queued before it
  as `skipped`. Admins can retry a single one from the outbox page.

## One-time setup

### 1. Resend
1. Create an account; pick Pro if expected volume needs it (the free tier's
   100/day is easily exceeded by one admin fan-out).
2. Add a **sending subdomain** (e.g. `mail.<your-domain>`) under Domains.
3. Add the SPF, DKIM and return-path DNS records Resend shows.
4. Add a DMARC record at `_dmarc.mail.<your-domain>`:
   `v=DMARC1; p=none; rua=mailto:<an inbox you read>`. Move to `p=quarantine`
   after ~2 weeks of clean reports.
5. Create an API key with **Sending access** only.
6. Add a webhook → `https://<production-origin>/api/webhooks/resend` for
   `email.delivered`, `email.bounced`, `email.complained`,
   `email.delivery_delayed`. Copy its signing secret (`whsec_…`).

### 2. Supabase (production project)
1. **Apply `supabase/migrations/0046_email_delivery.sql` first**, before the
   code deploys (the new code calls `claim_outbox_batch`).
2. Database → Extensions: enable **`pg_cron`** and **`pg_net`**.
3. Store the cron secret in Vault, then schedule the sweeper (SQL editor):

   ```sql
   select vault.create_secret('<the same CRON_SECRET you set in Vercel>', 'cron_secret');

   select cron.schedule('drain-email-outbox', '*/5 * * * *', $$
     select net.http_get(
       url     := 'https://<production-origin>/api/cron/drain-outbox',
       headers := jsonb_build_object(
         'Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                        where name = 'cron_secret'))
     );
   $$);
   ```

   Check it with `select * from cron.job_run_details order by start_time desc limit 5;`
   (Vercel Hobby has no sub-daily cron, hence pg_cron.)
4. **Auth emails** (sign-up confirmation, password reset) are a separate path
   through Supabase's own mailer, capped at a few per hour. Auth → SMTP
   Settings: host `smtp.resend.com`, port `465`, user `resend`, password = a
   Resend API key, sender = the same `EMAIL_FROM` address. Then Auth → Rate
   Limits: raise the email limit (custom SMTP starts around 30/hour).
5. Auth → URL Configuration: Site URL must be the **production origin** — it
   builds the links inside those emails (lessons L5).

### 3. Vercel environment variables
| Variable | Production | Preview / dev |
|---|---|---|
| `RESEND_API_KEY` | the key | leave unset (nothing sends) **or** a key + `EMAIL_REDIRECT_TO` |
| `EMAIL_FROM` | `Live·En·Synergy <notifications@mail.<domain>>` | same |
| `RESEND_WEBHOOK_SECRET` | `whsec_…` from step 1.6 | — |
| `CRON_SECRET` | `openssl rand -hex 32` (same value as the Vault secret) | — |
| `SUPABASE_SERVICE_ROLE_KEY` | project's service-role key — **mark Sensitive** | — |
| `EMAIL_REDIRECT_TO` | leave unset | one team inbox |
| `EMAIL_REPLY_TO` | optional | optional |

Redeploy after setting them (env vars apply to new deployments only).

## Verifying it works
1. As a QA user, do something that fires an emailing notification (e.g. submit
   feedback). Admin → Notifications → **Email outbox**: the row goes
   `queued → sent` within seconds, with a provider id.
2. Send to `bounced@resend.dev` (Resend's test address): the row's delivery
   status becomes `bounced` and the address appears under **Suppressed
   addresses**; later mail to it shows `skipped: suppressed`.
3. Temporarily set a wrong `RESEND_API_KEY` and redeploy: new rows show
   `queued` with `Attempts: 1` and a "next try" time (a 401 is not retryable,
   so it goes straight to `failed` — use a network-level failure to see
   backoff). Fix the key and use **Retry sending** on the failed rows.
4. `curl -i https://<origin>/api/cron/drain-outbox` → `401`; with the Bearer
   secret → `200` and JSON counts.

## Operating it
- **Failed rows:** Outbox page → filter *failed* → read the error → **Retry
  sending**. A suppressed address stays blocked until you click **Remove**
  under *Suppressed addresses*.
- **Stuck `sending`:** a row stuck >10 minutes (worker died) is re-claimed
  automatically by the next sweep.
- **Rotating the cron secret:** change it in Vercel *and* re-run
  `vault.update_secret` / re-create the cron job, then redeploy.
