# Email provider & brand-customisation research

Written 6 Aug 2026, in response to the 3 Aug standup items:

- *"Email branding and notification settings will be fully editable within the administrative portal."*
- *"Platform-based email communication mandated — full third-party white-label email integration (requiring user logins) is rejected to preserve audience trust; all communication will remain platform-based."*
- *"Customize Email Templates: develop branded email templates that support logos and specific font requirements (keep it pending for now) — I will plan this separately."*

This is that separate plan. It answers three questions: **what can be customised**, **how far we can go before it stops being platform-based**, and **which provider**.

---

## 1. Where we are today

The notification layer is already built and provider-agnostic — this is the good news, and it shapes every recommendation below.

| Piece | Location | State |
| --- | --- | --- |
| Event catalogue (31 events) | `notification_events` (`0006_notifications.sql`) | Seeded |
| Per-event channel toggles, CC/BCC | `notification_settings` | Admin-editable UI at `/dashboard/admin/notifications` |
| Per-event subject + body templates | `notification_templates` (`in_app` \| `email`) | Admin-editable, `{{token}}` substitution, live preview |
| Dispatch entry point | `notify()` / `notifyAdmins()` in [notifications.ts](src/lib/notifications.ts) | Working, never throws |
| Email queue | `email_outbox` — has `status`, `provider`, `provider_message_id`, `error`, `sent_at` | Rows accumulate at `queued` |
| **Actual sending** | — | **Nothing. No provider, no drain worker, no dependency in `package.json`.** |

So: every email the platform intends to send is being written to a table and never delivered. The schema comment says it outright — *"Wiring a real provider later means draining that table; no call site changes."*

Two consequences:

1. **The provider decision is cheap and reversible.** `email_outbox.provider` already exists as a column. One adapter module behind a `sendEmail()` interface is the entire integration surface. Picking wrong costs a day, not a rewrite.
2. **Templates are currently plain text and global per event key.** There is no HTML layout and no brand dimension. Both need to be added — that's the real work, not the provider.

Also already present: `brands.logo_url` (`0001_schema.sql:93`), so brand logos are being collected today.

---

## 2. Two separate email streams — don't conflate them

This trips up most Supabase projects and it changes what's customisable.

**Stream A — Supabase Auth emails.** Signup confirmation, password reset, magic link, email change. These are sent by GoTrue, not by our code. They never touch `email_outbox`. They're templated in the Supabase dashboard.

- The built-in Supabase SMTP is **capped at 2 emails/hour** and is explicitly dev-only. Production requires custom SMTP regardless of anything else in this document.
- On first configuring custom SMTP, Supabase imposes a **30 msg/hour** starting rate limit — raise it under Auth → Rate Limits or password resets will silently 429.
- These emails have **no brand context** (nobody has picked a sponsor at signup), so they carry platform branding only. That is not a limitation to work around; it's correct.
- Optional: Supabase's **Send Email Hook** lets our own code take over auth emails, which would route them through the same React templates as everything else. Worth doing eventually for visual consistency — verify the current hook API before committing, it has moved around.

**Stream B — app notification emails.** The 31 catalogue events. This is where brand customisation lives, and the rest of this document is about Stream B.

Both streams should send from the same authenticated domain so DKIM/SPF/DMARC alignment is set up once.

---

## 3. How far customisation can go — five levels

The constraint from the standup is "platform-based, preserve audience trust, no white-label." That's a clear line, but it sits between levels 3 and 4, not between 0 and 1. Mapping the spectrum:

### L0 — Platform only *(what the schema does today)*
One look for every email. Platform logo, platform voice.

### L1 — Brand-themed content block ✅ recommended
Platform chrome throughout — platform logo in the header, platform footer, platform from-address. The brand appears as a **"Sponsored by"** card inside the body: their logo, their name, maybe an accent rule.

Zero deliverability risk, zero moderation risk, and it's honest about who's sending. Most of the perceived value for ~20% of the work.

### L2 — Brand-themed template ✅ recommended (phase 2)
Brand logo in the header position, brand accent colour on buttons/headings/dividers, brand-selected typeface (with the enormous caveat in §4), brand-authored intro line and CTA label. **Platform footer, platform from-address, platform legal text stay fixed and non-editable.**

This is the realistic ceiling for "branded emails" that remain platform emails. Recipients see a Northwave Coffee–looking email that unambiguously comes from Live·En·Synergy.

### L3 — Sender identity ⚠️ needs your call
```
From: "Northwave Coffee via Live·En·Synergy" <notifications@liveensynergy.com>
Reply-To: hello@northwavecoffee.com
```

The envelope domain, DKIM signature and SPF record stay ours. The brand does no DNS work and holds no account. Only the *display name* changes. This is the Slack / Substack / Eventbrite pattern.

Worth noting precisely: Gmail appends its own "via *domain*" warning when the From domain differs from the DKIM `d=` domain. Here they're identical, so **Gmail adds nothing** — the "via" in the display name is our own literal text, deliberately placed.

I read this as still platform-based, but it's the closest call in this document and it's a brand-perception decision rather than a technical one. Flagging rather than assuming. Reply-To must be a verified address if enabled — otherwise it's an open relay for brand-impersonated replies.

### L4 — Custom sending domain ❌ rejected by the standup
`mail.northwavecoffee.com`, brand adds DNS records, brand manages their own reputation. This is what "requiring user logins" refers to, and it's what the decision rules out. Agreed — it also means brand DNS misconfiguration becomes our support burden, and one brand's spam complaints stop being containable.

### L5 — Brand-supplied raw HTML ❌ should be rejected outright
Not mentioned in the standup, but pre-empting it: never let a brand paste HTML into a template that our DKIM key signs. That is stored XSS in the admin preview, an open phishing vector under our domain, and it puts our sending reputation in the hands of a third party. **Structured fields only** — colour picker, logo upload, font shortlist, short plain-text strings. This constraint should be written into the spec now, because it's the kind of thing that gets requested later as "just let us tweak it."

**Recommendation: build L1, then L2, keep L3 behind an admin toggle, refuse L4/L5.**

---

## 4. The hard constraints — read before promising anything

### Fonts: the standup asks for something email cannot deliver

*"specific font requirements"* is the item most likely to disappoint, so it's worth being blunt.

Per Litmus's February 2026 data: **Apple Mail is ~51% of opens and renders `@font-face` correctly. Gmail strips custom fonts entirely. So do Outlook for Windows, Outlook.com, and Yahoo Mail.** Outlook for Windows renders through Word's engine — and if the font is loaded via `<link>` or `@import`, Outlook falls back to *Times New Roman* regardless of what fallback stack you specify.

So a custom font is a progressive enhancement for roughly half of recipients, and about half will see the fallback. Three practical responses:

1. **Ship the wordmark as an image.** The brand's actual typeface renders exactly, everywhere images load. This is the real answer to "we need our font" and it's what mature platforms do. Needs alt text — Outlook blocks images by default.
2. **Offer a curated shortlist, not a free-text font field.** Three or four options, each with a hand-matched fallback stack (a sans web font falls back to sans — never let line lengths swing). Free text guarantees broken rendering and support tickets.
3. Use `@font-face` inline (not `@import`) so Apple Mail gets the real thing without poisoning Outlook.

### Other rendering limits worth designing around

- **No flexbox, no grid.** Email is tables and inline styles. This is the single strongest argument for a template library rather than hand-written HTML.
- **Dark mode.** Gmail and Outlook auto-invert. Brand colours need testing against inverted backgrounds; logos need transparent PNGs or a light padded plate, or they'll show as a dark box on dark.
- **Contrast.** If a brand picks pale yellow as their accent, the CTA button becomes unreadable. Validate contrast ratio on the colour input at save time and reject or auto-darken.
- **Image blocking.** Outlook and many corporate clients block images by default. The email must be fully comprehensible with every image suppressed — so the brand name goes in as text alongside the logo, never as the logo alone.

### Governance

Every one of these emails is DKIM-signed by us and lands on our sending reputation. A brand should not be able to push unreviewed logos, colours or copy into that stream.

Convenient here: **the standup already put the controls in the admin portal** ("fully editable within the administrative portal"), which sidesteps the whole moderation problem for V1 — admin edits branding on the brand's behalf. If it later moves into the brand portal, it needs an approval gate (`approved_by` / `approved_at`).

---

## 5. Provider comparison

Constraints: Vercel + Supabase, Next.js 15 App Router, React 19, TypeScript, low volume at MVP, one small team.

| | Resend | Postmark | SendGrid | AWS SES |
| --- | --- | --- | --- | --- |
| **Vercel integration** | **Native Marketplace since 1 Jul 2026** — provision from Vercel CLI/dashboard, API key auto-injected, DNS configured automatically | Manual | Manual | Manual |
| **Templating** | **React Email** — templates as `.tsx` components, same language as the app | Hosted Mustache templates | Hosted Handlebars templates | Roll your own |
| **Deliverability** | Good; shared pools mix transactional + marketing | **Best in class** — 99%+ inbox, refuses marketing senders, enforced message-stream separation | Reliable on dedicated IP; variable on low-tier shared pools | Depends entirely on your own reputation management |
| **Free tier** | 3,000/mo, 100/day, 1 domain | Trial only | 100/day | — |
| **Entry paid** | $20/mo — 50k emails, multiple domains | Higher at low volume | Competitive | Cheapest per email by a wide margin |
| **At 500k+/mo** | $$$ | $$$ | Cheapest of the three | Cheapest overall |
| **Bounce/delivery webhooks** | Yes — opens, clicks, bounces, deliveries | Yes | Yes | Via SNS, more wiring |
| **SMTP relay** (for Supabase Auth) | Yes | Yes | Yes | Yes |
| **Setup effort** | Lowest | Low | Medium | High — requires production-access approval, plus you build suppression lists and bounce handling yourself |

### Recommendation: Resend

Reasoning, in priority order:

1. **React Email is the deciding factor, not the API.** The hard part of this project is a themeable HTML layout that survives Outlook — brand logo slot, accent colour variable, font shortlist, dark-mode-safe, table-based. React Email means writing that as TSX components with props, in the same repo, same types, same review process, with the brand theme passed straight in as props. Postmark's Mustache and SendGrid's Handlebars mean maintaining templates in a second system with a second deployment path, and dynamic per-brand theming through a string-template language is genuinely unpleasant.
2. **The Vercel Marketplace integration removes most of the setup.** Provisioning, env vars and DNS are handled from the tooling already in use.
3. **Volume is low enough that the price differences are noise.** At MVP scale everything here is $0–20/mo.
4. **Same account covers Stream A.** Resend's SMTP relay serves Supabase Auth from the same authenticated domain, so DKIM/SPF/DMARC is configured once.

### Where Postmark would win instead

If audience-facing deliverability turns out to be the primary risk — reward-release and attendance-verification emails are financially meaningful and must not land in spam — Postmark's refusal to host marketing senders on transactional infrastructure is a real, structural advantage, not marketing copy.

Given `email_outbox.provider` already exists and the adapter is one file, the sane play is: **start on Resend, instrument delivery rates from the webhooks, and keep Postmark as a costed fallback.** If inbox placement disappoints, swapping is a day's work. Don't pre-optimise for a problem we can measure directly.

Not recommended: **SendGrid** (worst DX, its cost advantage only appears at volumes we're nowhere near), **AWS SES** (cheapest per email, but you build templating, suppression, bounce handling and the admin surface yourself — the savings are dwarfed by the build time at this scale).

### One live cost trap

Resend's free tier caps at **100 emails/day**. A single fan-out — "500 participants selected for reward" — blows through that in one batch and the rest silently fail. **Budget for Pro ($20/mo) from launch**, not after the first incident. Dedicated IPs (Scale tier) are not warranted below sustained ~100k/mo; shared IPs are correct for us.

---

## 6. Implementation sketch

### Draining the outbox

Three viable mechanisms:

- **(a) Vercel Cron → `/api/cron/drain-outbox`** — renders React Email, calls Resend's batch API, updates `status`. Most maintainable given templates live in this repo. Confirm the cron granularity available on our Vercel plan; Hobby is far more restricted than Pro.
- **(b) Supabase Database Webhook on `email_outbox` INSERT → Edge Function → Resend** — near-realtime, no polling, but templates then live in Deno, away from the app.
- **(c) `pg_cron` + `pg_net` straight from Postgres** — fewest moving parts, but templating in SQL is not somewhere to be.

**(a) is the recommendation**, with these details that matter:

- Claim rows with `for update skip locked` — otherwise overlapping cron runs double-send.
- Add `attempts int` and `last_attempt_at` columns, with a retry ceiling before `status = 'failed'`.
- Write `provider_message_id` back on success; it's the join key for the webhook.
- Add a Resend webhook route to flip rows to bounced/complained and suppress future sends to that address.

### One schema change worth making now

`email_outbox` currently stores the **rendered** body. With HTML templates it should also store the **variables**, so an email can be re-rendered when a template changes and so the audit log survives a template edit:

```sql
alter table email_outbox add column variables jsonb;
alter table email_outbox add column attempts int not null default 0;
```

Keep the rendered snapshot too — admin needs to see what actually went out, not what would go out today.

### Brand branding table (phase 2)

```sql
create table brand_email_branding (
  brand_id       uuid primary key references brands (id) on delete cascade,
  logo_url       text,          -- defaults to brands.logo_url
  accent_color   text,          -- #RRGGBB, contrast-validated at save
  font_key       text,          -- FK to a curated shortlist, never free text
  intro_line     text,          -- plain text, length-capped, no HTML
  signature_name text,
  from_name      text,          -- L3 only, admin-gated
  reply_to       text,          -- L3 only, must be verified
  approved_by    uuid references profiles (id),
  approved_at    timestamptz,
  updated_at     timestamptz not null default now()
);
```

RLS: admin-manage, brand-owner read. If brand-owner write is ever enabled, any change must clear `approved_at`.

### Which emails actually carry brand branding

Not all 31. Brand identity is only meaningful where a sponsor is in the picture and the recipient is an audience member:

- `participation.registered`, `participation.selected`, `participation.rejected`, `participation.verified`, `participation.reminder`, `reward.released`
- arguably `offer.received` / `offer.proposal_received` (artist-facing, brand is the counterparty)

Account, admin and messaging emails stay platform-branded. Worth deciding this explicitly rather than theming everything — a brand logo on a password reset would be actively confusing.

---

## 7. Suggested phasing

| Phase | Scope | Unblocks |
| --- | --- | --- |
| **0** | Provision Resend, authenticate the domain, configure Supabase custom SMTP + raise the auth rate limit, build the drain worker, convert the plain-text templates into one platform-branded React Email layout | Email actually sends. Everything else is blocked on this and it's independent of the branding question. |
| **1** | Admin-editable *global* email branding — platform logo, colours, footer, per-event copy — matching the standup's "fully editable in the admin portal" | The literal standup item |
| **2** | Per-brand L1/L2 branding on the audience-facing subset above, admin-managed | The brand-customisation ask |
| **3** | *Optional, pending your decision:* L3 from-name + verified reply-to | — |

Phase 0 has value on its own and shouldn't wait on the branding design.

---

## 8. Decisions I need from you

1. **L3 — is `"Northwave Coffee via Live·En·Synergy"` acceptable as a from-name?** Technically still fully platform-based (our domain, our DKIM, no brand account). But it's a brand-perception judgement, and the standup decision was framed around audience trust.
2. **Font expectations.** Given ~half of recipients will never see a custom font, is the wordmark-as-image approach plus a curated fallback shortlist acceptable? Worth settling before the client sees a mock rendered in a font that Gmail will discard.
3. **Where do the controls live** — admin portal only (simple, no moderation needed, matches the standup wording), or brand portal with an admin approval gate (more work, better self-serve)?
4. **Expected monthly volume**, roughly. It only changes the answer above ~100k/mo, but that's also the point at which the provider choice would want revisiting.

---

## Sources

- [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing) · [Resend joins the Vercel Marketplace](https://vercel.com/changelog/resend-vercel-marketplace) · [Resend for Vercel](https://vercel.com/marketplace/resend)
- [Postmark vs SendGrid comparison](https://postmarkapp.com/compare/sendgrid-alternative) · [Best transactional email API 2026](https://emailsendx.com/blog/best-transactional-email-api-2026)
- [Supabase — send emails with custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) · [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Litmus — the ultimate guide to web fonts in email](https://www.litmus.com/blog/the-ultimate-guide-to-web-fonts) · [Custom fonts in email: what works, what doesn't](https://crafting.email/custom-fonts-in-email/) · [Web-safe fonts: the real support matrix in 2026](https://min8t.com/articles/web-safe-fonts-for-email)
