# Marketing email — what it is and how to switch it on

Admin → **Marketing** sends partner promotions on behalf of a brand to people
who ticked **"Partner newsletter & promotions"** when they registered for one
of that brand's events. Built from the plan "Multi-Brand Marketing Email System",
phases 1–4, plus a first cut of phase 5: **Generate with AI** writes a draft
for the admin to preview and edit.

Decisions this follows:

- **Platform opt-ins only.** No imported lists. A person hears from a brand
  only if they ticked the box at one of *that brand's* events.
- **Admins create and send.** Brands don't log in to build emails.
- **Our own block renderer** (not React Email): hero, steps, promo code,
  button/link. The header and the legal footer are always added and can't be
  removed.
- **One shared promo code per campaign.** Not unique per person.

## How it works

```
participations.newsletter_opt_in (the tick)
        │  trigger keeps it in step
        ▼
brand_subscriptions (person × brand)      marketing_suppressions (marketing-only blocks)
        │                                           │
        └──── marketing_eligible(brand, segment) ◄──┘  + email_suppressions (account-email
                                │                          bounces/complaints also block)
 Admin schedules ─► pg_cron every minute ─► /api/cron/marketing-send
                                │
             start: snapshot recipients into marketing_sends
             loop:  claim 100 → render each (own unsubscribe link) →
                    Resend /emails/batch (Idempotency-Key = batch key)
                    → record message ids / retry with backoff
                                │
       Resend webhook ─► /api/webhooks/resend ─► delivered / bounced / complained
                                │
          complaints > 0.1% or bounces > 2% ⇒ campaign + brand paused, admins told
```

**Tabs:**

- **Campaigns:** list and create.
- **Campaign page:**
  - While a draft: block editor, live light/dark preview, audience segment
    (everyone subscribed to the brand, or only people who agreed at chosen
    events), test send, schedule (UK time), send now, cancel.
  - Once scheduled or sending: progress by status, and pause / resume /
    unschedule / cancel / duplicate.
- **Generate with AI** (on a draft):
  - The admin gives a short brief, a tone, and optionally the promo code,
    what it's worth, the expiry and the button link.
  - The model writes the words only: subject, preview line, headline, body,
    2–5 steps, button text.
  - The code, discount, expiry and link go in exactly as typed. The prompt
    forbids inventing offers, dates or claims, and the code never takes
    them from the model.
  - The draft lands as **unsaved changes** with the preview updated. Nothing
    is saved or sent until the admin saves, tests and schedules.
  - Uses the same `OPENAI_API_KEY` / `OPENAI_MODEL` as the survey reports.
    Limited to 30 drafts per admin per hour.
- **Subscribers:** the old "Marketing list" with its CSV export. It now also
  shows marketing-only blocks.
- **Brand settings:**
  - Logo, accent colour, light/dark, font and legal line.
  - **Physical address.** Required: a campaign can't be scheduled without
    one. It falls back to the brand's company address.
  - Reply-to.
  - Brand-wide pause and resume.

**What someone who gets the email can do:**

- **The "Unsubscribe" link** opens `/u/<token>`, a confirm page. Opening it
  changes nothing; that's deliberate, because inbox link-scanners open links.
  They choose **this partner** or **all partner emails**.
- **Gmail / Apple Mail "Unsubscribe" button:** one-click (RFC 8058, the
  `List-Unsubscribe` + `List-Unsubscribe-Post` headers), which unsubscribes
  from that brand.
- **Either way:**
  - The event's tick is removed, so My events agrees.
  - The change is written to the consent log.
  - **Account emails are never affected.** Sign-in links, codes and event
    updates are kept separate from marketing blocks.
- **To come back:** tick the box again on an event of that brand. A spam
  complaint is never lifted that way.

**Safety rails:**

- **Edits:**
  - A draft is the only thing that can be edited.
  - A scheduled campaign is unscheduled to edit.
  - Once sending starts, the database refuses content changes.
- **Rechecked before sending:**
  - Everything is checked at scheduling and again at the moment it starts:
    subject, address, https images and links, alt text, 2–5 steps, code
    format, button link.
  - If something broke in between (e.g. the address was removed), the
    campaign pauses with the reason instead of sending.
- **Each batch re-checks every recipient.** Someone who unsubscribed
  mid-campaign is skipped.
- **A crashed worker can't double-send.** The unfinished batch is claimed
  again with the same Idempotency-Key.
- **One bad address doesn't fail a batch.** The batch is retried one by one,
  so only that address fails.
- **Outside production** nothing reaches real people:
  - Mail goes to `EMAIL_REDIRECT_TO` (subject `[preview → …]`), at most 10 per
    campaign. The rest are marked skipped.
  - Without a redirect address, nothing is sent.

## Switching it on

### 1. A separate sending subdomain (do this first; DNS takes time)

Promotions draw more spam complaints than account emails. Keep them on their
own subdomain so a bad campaign can't land sign-in links in spam.

1. In Resend, **add a domain** such as `news.<your-domain>` (separate from
   the `mail.` one used for account emails).
2. Add the DNS records Resend shows:
   - **SPF** and **DKIM** (TXT/CNAME);
   - an MX for the bounce subdomain;
   - **DMARC** on the subdomain, e.g. `_dmarc.news` TXT
     `v=DMARC1; p=none; rua=mailto:<you>`. Move to `quarantine` once reports
     look clean.
3. Wait for Resend to show the domain **Verified**.
4. Optional but recommended:
   - Register the domain in **Google Postmaster Tools** to see Gmail's
     spam-rate view.
   - Keep the spam rate under 0.1% (Gmail's 2024 bulk-sender rule; the
     auto-pause uses the same line).

### 2. Environment variables (Vercel → Settings → Environment Variables)

| Variable | Value |
|---|---|
| `MARKETING_EMAIL_FROM` | e.g. `offers@news.<your-domain>`. The brand's name is used as the display name. |
| `MARKETING_UNSUBSCRIBE_SECRET` | 32+ random characters (`openssl rand -hex 32`). **Set it once.** Changing it breaks every unsubscribe link already sent. |
| `MARKETING_RESEND_API_KEY` | Optional. Only if marketing uses its own Resend account; otherwise `RESEND_API_KEY` is used. |
| `MARKETING_RESEND_WEBHOOK_SECRET` | Optional. Only with that separate account (see step 4). |

`NEXT_PUBLIC_SITE_URL` must be the real public origin. It builds the
unsubscribe links. `CRON_SECRET` is the existing one.

Until these are set, the Campaigns tab says what is missing. Campaigns can
be built and previewed, but not tested or scheduled.

### 3. Database

1. Apply `supabase/migrations/0116_marketing_campaigns.sql` **before
   deploying** (the Marketing pages read its tables).
2. Run `docs/db-verify-0104-0109.sql`. Group **M** should be all PASS.
3. Schedule the worker every minute (SQL editor; the `cron_secret` Vault
   entry already exists from the email setup):

   ```sql
   select cron.schedule('marketing-send', '* * * * *', $$
     select net.http_get(
       url     := 'https://<production-origin>/api/cron/marketing-send',
       headers := jsonb_build_object(
         'Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                        where name = 'cron_secret')),
       timeout_milliseconds := 60000
     );
   $$);
   ```

   "Send now" also starts the worker straight away. The schedule picks up
   scheduled times, retries, and anything left half-done.

### 4. Webhook

- **Same Resend account:** nothing to do. The existing webhook
  (`/api/webhooks/resend`, events `email.delivered`, `email.bounced`,
  `email.complained`) recognises marketing emails by their `campaign_id` tag.
- **Separate marketing account:** add a webhook there to the same URL with
  those three events, and put its signing secret in
  `MARKETING_RESEND_WEBHOOK_SECRET`.

### 5. Warm-up

A new sending domain with no history gets filtered if it suddenly sends
thousands of emails. For the first two weeks:

- Send to small segments first: the most recent events, a few hundred
  people.
- Grow each send by roughly 2× while bounces and complaints stay low.
- Watch the campaign page: bounces under 2%, "Marked as spam" well under
  0.1%.

## Checking it end to end (Test mode, before the first real send)

1. **Brand settings.** Choose a brand and check the physical address. Save.
2. **New campaign.** Build it from the brand: hero, steps, promo code, button.
   - Flip the preview between Light and Dark.
   - Save. "Before this can be sent" should be empty.
3. **Send test** to your address. Check:
   - the subject starts `[TEST]`;
   - the email looks right in Gmail and Apple Mail, in light and dark;
   - Gmail shows an **Unsubscribe** button next to the sender.
   - The test's unsubscribe link is for your own account, so using it
     unsubscribes *you* from that brand. Re-tick the box on one of its events
     to undo.
4. **Schedule** a few minutes ahead to a small event segment. Then:
   - the status moves Scheduled → Sending → Sent;
   - Progress counts fill in;
   - "Delivered" appears as Resend reports back.
5. **Unsubscribe as a recipient** (a test account). From the email:
   - Choose "this partner". The tick on that brand's events is gone under
     My events; other brands are untouched.
   - Try "all partner emails". The person disappears from every brand's
     audience count. Account emails still arrive.
6. **Pause** a sending campaign, then resume it. It continues where it
   stopped, and anyone who unsubscribed meanwhile shows as Skipped.

## Where things live

| Piece | File |
|---|---|
| Schema, worker functions, auto-pause | `supabase/migrations/0116_marketing_campaigns.sql` |
| Blocks, checks, merge fields | `src/lib/marketing/blocks.ts` |
| HTML + text renderer | `src/lib/marketing/render.ts` |
| Worker, test send, brand tokens | `src/lib/marketing/send.ts` |
| AI draft (words only; facts from the admin) | `src/lib/marketing/generate.ts` |
| Unsubscribe tokens | `src/lib/marketing/unsubscribe-token.ts` |
| Unsubscribe page / one-click | `src/app/u/[token]/page.tsx`, `src/app/api/marketing/unsubscribe/[token]/route.ts` |
| Cron | `src/app/api/cron/marketing-send/route.ts` |
| Webhook | `src/app/api/webhooks/resend/route.ts` |
| Admin pages + actions | `src/app/dashboard/admin/marketing/` |
