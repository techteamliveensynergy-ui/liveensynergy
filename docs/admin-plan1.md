# Admin Plan 1 — Notifications & Marketplace Oversight

Planning doc for the next two admin build phases. Phase A is the notification
system (in-app + email, admin-controlled). Phase B is marketplace oversight —
giving admin visibility and control over every core object in the platform.

Written to be implementable as-is; each section lists the schema, the screens,
and what's deliberately deferred.

---

# Phase A — Notifications

## A1. Design principles

- **Two channels, one catalogue.** Every notifiable thing that happens in the
  app is an *event* with a stable `key`. Each event can fire on the **in-app**
  channel, the **email** channel, or both. Admin toggles each independently.
- **Templates are data, not code.** Subject/body live in the database so admin
  can edit and preview them without a deploy.
- **Provider-agnostic delivery.** Emails are written to an **outbox** table
  with status `queued`. Wiring a real provider (Resend / Postmark / SES) later
  means writing one worker that drains the outbox — no changes to any call
  site. Until then the outbox *is* the audit log, and admin can preview
  exactly what would have been sent.
- **Never block the user action.** Enqueuing a notification must never fail a
  sponsorship, registration, or sign-up. All writes are best-effort.

## A2. Event catalogue

Grouped by audience. `key` is the stable identifier used in code.

### Account & access
| Key | Fires when | Default in-app | Default email |
|---|---|---|---|
| `account.welcome` | A new account completes sign-up | ✓ | ✓ |
| `account.onboarding_completed` | Role profile finished | ✓ | — |
| `account.blocked` | Admin blocks the account | — | ✓ |
| `account.restored` | Admin restores access | ✓ | ✓ |
| `account.role_changed` | Admin changes their role | ✓ | ✓ |
| `account.plan_changed` | Admin assigns/changes a plan | ✓ | ✓ |
| `account.password_reset` | Password reset requested | — | ✓ |

### Brand / sponsor
| Key | Fires when | Default in-app | Default email |
|---|---|---|---|
| `campaign.created` | Brand submits a campaign | ✓ | ✓ |
| `campaign.status_changed` | Campaign moves in_progress → closed → completed | ✓ | ✓ |
| `campaign.matched` | Admin/team matches a campaign to an event | ✓ | ✓ |
| `sponsorship.created` | Sponsored event created from a match | ✓ | ✓ |
| `sponsorship.artist_agreed` | Artist accepts the terms | ✓ | ✓ |
| `sponsorship.confirmed` | Both parties agreed | ✓ | ✓ |
| `sponsorship.completed` | Event marked completed | ✓ | ✓ |
| `sponsorship.budget_low` | Remaining budget drops below a threshold | ✓ | — |

### Artist / event organiser
| Key | Fires when | Default in-app | Default email |
|---|---|---|---|
| `listing.published` | Listing goes `draft` → `available` | ✓ | — |
| `listing.status_changed` | Admin overrides a listing status | ✓ | ✓ |
| `offer.received` | A brand starts an enquiry (conversation) | ✓ | ✓ |
| `offer.proposal_received` | A sponsored event awaits their agreement | ✓ | ✓ |
| `participant.registered` | An audience member registers for their event | ✓ | — |
| `participant.proof_uploaded` | Ticket proof submitted | ✓ | — |

### Audience
| Key | Fires when | Default in-app | Default email |
|---|---|---|---|
| `participation.registered` | They register for a sponsored event | ✓ | ✓ |
| `participation.selected` | Selected for the reward pool | ✓ | ✓ |
| `participation.rejected` | Not selected | ✓ | ✓ |
| `participation.verified` | Attendance verified | ✓ | ✓ |
| `reward.released` | Reward paid out | ✓ | ✓ |
| `participation.reminder` | Event is approaching / deadline nears | ✓ | ✓ |

### Messaging & admin
| Key | Fires when | Default in-app | Default email |
|---|---|---|---|
| `message.received` | New chat message from the counterparty | ✓ | — |
| `admin.contact_message` | Public contact form submitted | ✓ | ✓ |
| `admin.new_signup` | Any new account registers | ✓ | — |
| `admin.campaign_request` | New campaign needs matching | ✓ | ✓ |

> ~30 events. The catalogue is seeded by migration so admin sees the full list
> immediately, with sensible defaults, and can toggle from there.

## A3. Schema

```
notification_events          -- the catalogue (seeded, not user-created)
  key                text pk           -- 'reward.released'
  name               text              -- 'Reward released'
  description        text
  category           text              -- account | brand | artist | audience | messaging | admin
  audience           text              -- who receives it
  variables          text[]            -- {{user_name}}, {{event_name}}, ...
  sort_order         int

notification_settings       -- admin-controlled, one row per event key
  event_key          text pk -> notification_events(key)
  in_app_enabled     bool default true
  email_enabled      bool default true
  email_cc           text[]            -- always-CC these addresses
  email_bcc          text[]
  updated_by         uuid -> profiles(id)
  updated_at         timestamptz

notification_templates      -- one row per (event, channel)
  id                 uuid pk
  event_key          text -> notification_events(key)
  channel            text              -- 'in_app' | 'email'
  subject            text              -- email subject / in-app title
  body               text              -- supports {{variable}} tokens
  unique (event_key, channel)

notifications               -- the in-app inbox
  id                 uuid pk
  recipient_profile_id uuid -> profiles(id)
  event_key          text
  title              text
  body               text
  link               text              -- deep link into the app
  read_at            timestamptz
  created_at         timestamptz

email_outbox                -- provider-agnostic queue + audit log
  id                 uuid pk
  to_email           text
  cc                 text[]
  bcc                text[]
  subject            text
  body               text
  event_key          text
  recipient_profile_id uuid
  status             text              -- queued | sent | failed | skipped
  provider           text
  provider_message_id text
  error              text
  created_at, sent_at timestamptz
```

**RLS**
- `notification_events`, `notification_settings`, `notification_templates`,
  `email_outbox` — admin only (read + write).
- `notifications` — recipient reads/updates their own; admin reads all.

## A4. Delivery pipeline

One entry point, used everywhere:

```ts
await notify({
  eventKey: "reward.released",
  recipientProfileId: participation.audience_profile_id,
  variables: { event_name, reward_amount, user_name },
  link: `/dashboard/rewards`,
});
```

`notify()` then:
1. Loads the event's settings (cached).
2. If `in_app_enabled` → renders the in-app template → inserts into `notifications`.
3. If `email_enabled` → resolves the recipient's email → renders the email
   template → inserts into `email_outbox` with `status='queued'`, attaching the
   configured `email_cc` / `email_bcc`.
4. Never throws — failures are swallowed and logged so the user's action still
   succeeds.

Template rendering is simple `{{token}}` substitution against the supplied
variables, with unknown tokens left visible so admin spots template bugs.

## A5. Screens

**`/dashboard/admin/notifications`** — the catalogue
- Grouped by category, one row per event
- Two toggles per row (In-app / Email) — save immediately
- Shows whether a template exists for each channel
- Filter by category, search by name/key

**`/dashboard/admin/notifications/[key]`** — edit + preview
- Toggles for both channels
- Email CC / BCC (comma-separated)
- Two template editors (in-app title+body, email subject+body)
- **Live preview** pane rendering the template with realistic sample data,
  shown as an email (subject + body) and as an in-app card
- Available `{{variables}}` listed as click-to-insert chips

**`/dashboard/admin/notifications/outbox`** — the audit log
- Every queued/sent/failed email with recipient, subject, status, timestamp
- Row expands to the full rendered body
- Filter by status / event
- This is what proves the system works before any provider is wired

**In-app inbox (all users)**
- Bell in the dashboard header with unread count
- Dropdown of recent notifications, click marks read + deep-links
- `/dashboard/notifications` full list

## A6. Deferred
- Actual email sending (provider wiring + outbox drain worker)
- Per-user notification preferences (this phase is admin-level control only)
- Digest/batching, quiet hours
- Push / SMS channels

---

# Phase B — Marketplace oversight

Admin needs to see and control every core object, not just users.

## B1. Events browser — `/dashboard/admin/events`

Currently a thin list. Rebuild as two tabs:

**Listings tab** (`event_listings`)
- Columns: name, owner (link to their admin user page), category, city, date,
  budget range, status, created
- Filters: status (draft/available/matched/closed), category, city, owner role
- Search by name/reference
- Inline status override (already exists — keep)
- Row → listing detail

**Sponsored events tab** (`sponsored_events`)
- Columns: name, brand, artist, budget, remaining, status, both agreement
  flags, participant count, event date
- Filters: status, agreement state (awaiting brand / awaiting artist /
  confirmed), date range
- Row → sponsored event detail

## B2. Sponsored event detail — `/dashboard/admin/events/sponsored/[id]`

The single most useful admin screen — everything about one deal:

- **Deal summary**: brand ↔ artist, linked campaign, linked listing, budget,
  remaining budget, fee breakdown (`computePlatformFee`), reward rules, terms,
  participation deadline
- **Agreement state**: who has agreed, when; admin status override
- **Participants table**: every registration with status, selected flag, ticket
  proof link, verification timestamp, reward amount, consent/payout flags
  - Admin can run the same select / verify / release actions as the organiser
  - Bulk actions: select N, verify selected, release with a fixed amount
- **Funnel**: registered → proof uploaded → verified → rewarded, with counts
  and conversion percentages
- **Money**: total released vs remaining budget, per-participant breakdown
- **Conversation**: read-only view of the brand ↔ artist thread for this deal

## B3. Campaigns browser — `/dashboard/admin/campaigns`

- All campaigns with brand, reference, budget, net-after-fee, category,
  location, timeline, status, matched-or-not
- Filters: status, category, budget band, has/hasn't been matched
- Detail view with full brief + reward rules
- **Match action**: link a campaign to an available listing and spin up the
  sponsored event — this is currently a manual DB job and is the main
  admin workflow the product assumes exists

## B4. Participants browser — `/dashboard/admin/participants`

Cross-event view of every participation:
- Audience member (link to admin user page), event, status, selected, reward
- Filters: status, event, selected, reward released
- Spot-check consent and payout flags for compliance

## B5. Contact messages — `/dashboard/admin/messages`

The public contact form already writes to `contact_messages` and admin RLS
allows reads, but there is **no screen** — submissions are currently invisible.
- List with name, email, subject, received
- Row expands to full body
- Mark handled (needs a `handled_at` column)

## B6. Overview rebuild — `/dashboard/admin`

Replace the flat counters with an actionable console:
- **Needs attention**: campaigns awaiting match, sponsorships awaiting an
  agreement, unhandled contact messages, participants verified but unrewarded
- Metric tiles with deltas
- Funnel across the whole platform
- Recent activity feed

## B7. Schema additions
```
contact_messages
  + handled_at    timestamptz
  + handled_by    uuid -> profiles(id)

campaigns
  + matched_listing_id uuid -> event_listings(id)   -- makes matching explicit
```

## B8. Deferred
- Payments/payouts console (needs Stripe)
- Exports (CSV) — easy to add once the tables exist
- Audit log of admin actions (worth doing before real launch)

---

# Build order

1. **A3** schema + seed the event catalogue
2. **A4** `notify()` pipeline + outbox
3. **A5** admin notification screens (catalogue → editor+preview → outbox)
4. **A5** in-app inbox + header bell
5. Wire `notify()` into the ~30 existing call sites
6. **B1/B2** events browser + sponsored event detail (highest admin value)
7. **B3** campaigns + match action
8. **B4/B5** participants browser + contact inbox
9. **B6** overview rebuild

Phases A and B are independent — A can ship without B.
