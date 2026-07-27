# Live-En-Synergy — Platform Plan

This document captures the full product surface: the screens list, the user
journeys per role, planned third-party integrations, and the roadmap. It
complements the concept doc and the 26 Jun 2026 scoping call.

---

## 1. Roles

| Role | Who | Core need |
| --- | --- | --- |
| **Brand / Sponsor** | Companies funding sponsorships | Reach engaged audiences, verified outcomes |
| **Artist** | Performers/creators | Sponsorship funding + confirmed attendance |
| **Event Organiser** | Event/venue teams | Sponsorship + confirmed attendance |
| **Audience** | Fans/attendees | Reimbursed tickets & sponsor-funded rewards |
| **Admin** | Live-En-Synergy team | Oversee, match, moderate, pay out |

---

## 2. Screens list

### Public / marketing  ✅ built in V1
- Landing / homepage (hero, how-it-works, 3-way benefits, events preview, pricing, CTA)
- About us
- Events available for sponsorship (browse + filter placeholder)
- Contact us
- FAQs
- Terms & Conditions
- Privacy Policy

### Authentication  ✅ built in V1
- Sign up — **Step 1: choose role**, Step 2: account details
- Sign in
- Email confirmation callback
- Sign out
- _(roadmap)_ Forgot / reset password

### Onboarding  ✅ built in V1
- Onboarding router (sends user to their role form)
- Brand onboarding (profile, socials, internal info, manager/contact)
- Artist onboarding (profile, socials, internal info, sponsor value)
- Event organiser onboarding (profile, socials, internal info, sponsor value)
- Audience onboarding (personal details, consent framing)

### Dashboard — shared  ✅ shell built in V1
- Dashboard overview (role-aware quick-start)
- Profile (editable — reuses onboarding forms) ✅
- Messages / chat  _(roadmap)_
- Settings  _(roadmap)_

### Dashboard — Brand  ✅ built
- Campaigns list + create/edit campaign proposal (with live fee/available-budget preview)
- Discover events available for sponsorship + "Contact organiser" (starts a chat)
- Sponsored events: create, agree terms, run participant selection/verification/reward

### Dashboard — Artist / Event  ✅ built
- My events (create listing, publish/unpublish for sponsorship, edit, delete)
- Sponsor offers / incoming interest (brand enquiries + proposals to review)
- Sponsored events (confirmation, terms, dual agreement)

### Dashboard — Audience  ✅ built
- Discover events (open sponsored events with reward rules)
- My events (register, submit ticket proof, consent/payout preferences)
- My rewards (verified attendance → released rewards, running total)

### Sponsored Event workspace  ✅ core built
- Event setup + link brand/artist profiles & campaign
- Sponsorship management (budget, remaining budget, reward rules)
- Terms + dual agreement (brand & artist checkboxes → auto-confirm)
- Participant selection → attendance verification → reward release
- _(roadmap)_ Payment automation, analytics/funnel, custom FAQs, feedback

### Admin  ✅ console built
- Overview (counts across all entities, recent requests & sponsored events)
- **Users** — manage roles, assign plans, activate/deactivate accounts
- **Plans** — create/edit subscription tiers, activate/deactivate
- **Events** — monitor listings & sponsored events (registered/verified counts),
  override statuses
- _(roadmap)_ Customer queries inbox, payments console

---

## 3. User journeys

### Brand / Sponsor
1. Sign up → choose **Brand/Sponsor** → create account.
2. Onboard: brand profile, product category, socials, internal targeting info,
   sponsorship manager & contact.
3. Create a **campaign** (budget, category, location, timeline, reward rules).
4. Live-En-Synergy matches a fitting artist/event; campaign status tracked
   (In Progress → Closed → Completed).
5. Confirm a **sponsored event**: agree terms, fund budget, get branding value.
6. Track outcomes: verified attendance, conversion funnel, audience insights.

### Artist / Event Organiser
1. Sign up → choose **Artist** or **Event Organiser** → create account.
2. Onboard: profile, bio/description, socials, internal contact info, and the
   **sponsor value** they can offer (posts, mentions, onsite branding, merch).
3. List **events** available for sponsorship (date, venue, capacity, ticket
   price, budget range, benefits to sponsor).
4. Receive sponsor offers / get matched; chat with the sponsor.
5. Confirm the sponsored event and agree terms.
6. Help run selection & verification; audience attends; rewards released.

### Audience
1. Sign up → choose **Audience** → create account.
2. Onboard: name, contact, DOB, address (consent-first framing).
3. Discover events with sponsor-funded rewards; register for one.
4. Buy a ticket, upload proof, attend (verified via QR/box office).
5. If selected per the reward rule, provide payout details and receive the
   reimbursement/reward.

### Admin
1. Review incoming sponsor campaign requests and match to artists/events.
2. Manage events, statuses, and confirmations.
3. Configure reward rules, FAQs, and branded communications per event.
4. Run eligibility checks & selection; oversee verification and payouts.
5. Handle customer queries and audience data management.

---

## 4. Planned integrations

| Area | Integration | Purpose |
| --- | --- | --- |
| **Auth** | Supabase Auth | Email/password now; OAuth (Google) later |
| **Payments (in)** | Stripe | Brands fund sponsorship budgets |
| **Payments (out)** | Stripe Connect / payouts | Reimburse selected audience members; optional virtual cards to avoid sharing bank details |
| **Identity verification** | Third-party KYC (e.g. Stripe Identity / Onfido) | Verify audience identity & reduce fraud |
| **Attendance** | QR code generation + box-office data | Physical attendance verification at venue |
| **Email** | Transactional email (Resend / Postmark / Supabase) | Confirmations, branded templates, notifications |
| **File storage** | Supabase Storage | Logos, banners, profile images, ticket proof uploads |
| **Chat** | Supabase Realtime | Sponsor ↔ artist messaging |
| **Analytics** | Product analytics + in-app metrics | Funnel, participation, audience insights |
| **Templates / creatives** | AI generation (roadmap) | Per-event branded audience-facing templates |

---

## 5. Pricing model (implemented as a helper)

Live-En-Synergy charges **£315 + VAT** or **9% + VAT** of the sponsorship
budget, whichever is higher. See `computePlatformFee()` in
`src/lib/constants.ts`.

The flat minimum dominates until **£3,500** (9% of £3,500 = £315), so small
budgets are mostly fee. Below **£378** — the flat fee inc. VAT — the fee would
exceed the whole budget, so campaigns at or under that are rejected
(`MIN_SPONSORSHIP_BUDGET_GBP`). This replaces the earlier "no minimum budget"
rule, which allowed a negative amount available for sponsorship.

- £400 budget → £378 inc. VAT fee → £22 available for sponsorship.
- £1,000 budget → £378 inc. VAT fee → £622 available for sponsorship.
- £4,000 budget → £432 inc. VAT fee → £3,568 available for sponsorship.

---

## 6. Data model (see `supabase/migrations`)

Core tables: `profiles`, `brands`, `artists`, `event_organisers`,
`audience_members`, `campaigns`, `event_listings`, `sponsored_events`,
`participations`, `conversations`, `messages`, `contact_messages`.

Row Level Security is enabled on every table: users read/write only their own
rows, admins see everything, and a few tables expose limited access where the
product needs it (public read of available event listings, sponsor↔artist chat
between participants, public insert on the contact form).

---

## 7. V1 status vs. roadmap

**Shipped:** landing + marketing pages, role-first auth, role-based onboarding,
editable profiles, responsive dashboard with role-based sidebar, and the full
working platform loop — brand campaigns, artist/event listings, discovery,
sponsor↔artist chat, the sponsored-event workspace (terms, dual agreement,
participant selection → verification → reward release), audience participation
& rewards, and an admin console — all on the database schema with RLS.

**Next up (integrations & polish):** Stripe payments (fund-in + payouts,
optional virtual cards), KYC identity verification, storage-backed file uploads
(logos, banners, ticket proof), realtime chat updates, QR/box-office attendance
capture, transactional email templates, and analytics dashboards
(funnel, participation, audience insights).
