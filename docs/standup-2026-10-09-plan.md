# Next phase plan — from the 9 Oct 2026 standup

Drafted 10 Oct 2026 from the 9 Oct standup notes (Ketan, Sakshi), a code
audit of every portal (admin, brand, artist, audience) and a read-only check of
the production database. Nothing here is built yet.

**Order of work:** security fixes first (§1), then the clean-up that testing
will otherwise keep tripping over (§3), then the new Insights module (§4).
Domain go-live (§6) runs in parallel — it's settings, not code.

---

## 0. What the standup asked for, and where it stands

| From the standup | Status today | Plan |
|---|---|---|
| Survey CSVs without names, one row per person; rejected filterable | ✅ built (0059) | — |
| Survey metrics: responses per day, time per question, target tracking | ✅ built | — |
| **Automated insights summary / AI executive summary, charts, open-text reporting** | ❌ | §4 — new Insights module |
| **Cross-tabulation (age, gender, employment, ticket type), SPSS-style; scale to 5,000+** | ❌ | §4.3 |
| Campaign events: search by **artist name**, statuses awaiting artist / awaiting brand / in progress / **completed when the date has passed** | Partly — status chips exist; search only matches event name/reference; "completed" is manual | §3.1 |
| Participants: keep event filter, codes, attendance; **remove payout and reward trackers** | Partly — Reward £ and "payout ✓" still on every row and in the header | §3.1 |
| Audience funnel: registrations → survey completions → proof uploads → **discounts issued** | Partly — last step is "Rewarded" (cash) | §3.1 |
| Messaging per brand | One team thread per user; "+ New thread" reopens the same one | §5 — decision |
| Mobile view | Mostly fine; a few overflow spots | §3.5 |
| Dummy test profiles with `name+1@gmail.com` | Email works; **phone blocks it** (one phone per audience account) | §7 |
| Coupons released after the surveys | ✅ gated on a passing post-event survey — but always manual, and status never moves on | §3.4 |
| Terms acceptance with timestamp | ✅ (Compliance & audit page) | — |
| Live domain (`www.liveensynergy.com`) | DNS in progress | §6 |
| Cold emails from Gmail | Outside the platform | — |

---

## 1. Fix first — security (found during the audit, confirmed in production)

### 1.1 Audience can rewrite their own participation row — **P0**

`participations` has one policy for audience, `"participations: audience
owner"`, `FOR ALL` (0002), and no column guard. The production check on
10 Oct returned that policy, an `updated_at` trigger and nothing else, and
`authenticated` holds full table privileges. With their own session and the
public anon key, an audience member can:

- set `selected = true` (skip the random draw),
- set `status = 'attendance_verified'` (skip check-in), which also opens the
  post-event survey and makes them eligible for a discount code,
- set `reward_amount_gbp`, insert rows with any status, delete a selected row.

The artist and brand have a similar problem through `"participations: event
party manage"` (UPDATE on any column for either party).

**Fix (migration 0061):** a `BEFORE INSERT OR UPDATE OR DELETE` trigger on
`participations`, exempting admins and the service role:

| Caller | May do |
|---|---|
| Audience (own row) | insert only as `registered`, `selected = false`; update only ticket fields (`registered → ticket_uploaded`), newsletter and consent fields; delete only while `selected = false` |
| Artist (event party) | `attendance_verified` on a selected, not-yet-verified row — nothing else |
| Brand | read only (see 1.3) |
| Admin / service role | anything |

Same technique as `campaign_order_forms` (0054): the database is the rule,
app checks are the courtesy.

### 1.2 Check-in never checks the QR token — **P0**

`confirmAttendance` (`src/app/attend/[token]/actions.ts`) verifies the
participation id the form sends, but never compares `token` with that event's
`sponsored_events.attendance_qr_token`, and never checks the date. Anyone
selected could POST a check-in from home.

**Fix:** move check-in into a `security definer` RPC
`confirm_attendance(p_token, p_participation_id)` that checks the token
matches the participation's event, the row is the caller's, selected, not yet
verified, and the event is today (in the event's own time zone, ± a window —
decision §8.6). With 1.1 in place the plain update would be refused anyway,
so the RPC becomes the only way in.

### 1.3 Brand can verify attendance

The brief says check-in is artist + audience only; the brand still gets the
"Verify attendance" button on `sponsored/[id]` (`page.tsx:775-784`). Remove
it, and the 1.1 trigger blocks it underneath.

---

## 2. How I checked

- Standup notes (Gemini) — all actions and discussion points.
- Code audit of each portal: nav, every page, old-model leftovers, journeys,
  mobile risks, broken links.
- Production DB (read-only): `participations` policies, triggers, grants.

---

## 3. Portal clean-up (old cash model → discount-code model)

Agreed at the standup: remove payout and reward trackers, keep discount-code
issuance. The cash path is still live end to end, so this is a deliberate
retirement, not just copy changes.

### 3.1 Admin

- **Participants** (`admin/participants/page.tsx`): drop "£… rewarded to
  date", the Reward £ column and "payout ✓"; add **Code** (issued / held by
  survey gate / not eligible) and **Survey** (pre ✓ / post ✓). Export: same
  columns (`participants/export/route.ts`).
- **Overview** (`admin/page.tsx`): funnel becomes Registered → Took a survey →
  Proof uploaded → Checked in → **Code issued**; "Rewarded £" tile → "Codes
  redeemed"; "Verified, unrewarded" → **"Checked in, no code yet"** (split
  "held by survey gate" vs "ready to issue").
- **Events** (`admin/events/page.tsx`): search also matches **artist name**
  (and brand name); a search box (the `q` param exists but has no input);
  status groups exactly as the standup named them — Awaiting artist, Awaiting
  brand, In progress, Completed — where **Completed includes confirmed
  events whose date has passed** (derived on read; plus a nightly job to set
  `status = 'completed'` so other pages agree — decision §8.7).
- **Sponsored event admin page**: remove the "Release £" input, "Available
  for rewards", "Released £" and "suggested places from budget ÷ ticket
  price"; the selection draw asks for a number of places directly.
- Retire `adminUpdateParticipation op=release` and the `reward.released`
  (£ amount) notification; keep the data (historic rows stay readable).

### 3.2 Brand

- **Dead links** — fix first: "Manage →" on Brand home (`BrandHome.tsx:151`)
  and "Campaign details ↗" in Messages (`messages/page.tsx:375`) both go to
  `/dashboard/campaigns/{id}`, which is the intake edit route and always 404s.
- **Brand campaign page** (new, `/dashboard/campaigns/[id]` for converted
  campaigns): status timeline (request → order form → invoice → paid → matched
  → live → completed), order form, invoice, the linked sponsored event(s), and
  survey results. Today the brand can only reach the live panel once a
  sponsored event exists.
- Remove old-model money: "Available for rewards", "£… for rewards", "£… net",
  "People this can sponsor", "Remaining budget updates as rewards are released"
  (`BrandHome.tsx`, `sponsored/page.tsx`, `sponsored/[id]/page.tsx`).
- **Brand can still create a sponsored event** (`/dashboard/sponsored/new`,
  with the old fee calculator). Campaigns are admin-created now — remove the
  entry point and route, or redirect to a campaign request.
- "Create a campaign — set a budget and reward rules" → **"Request a
  campaign"**.
- Participant names on the brand's event page: the comment says brands see
  anonymised data (24 Aug standup) but names show — already open as decision 1
  in `admin-portal-tracker.md`.
- Live panel shows no response counts for the brand (`campaign_party_surveys()`
  doesn't return them) — add totals.
- Notify the brand when results become visible (5 counted responses) and when
  admin publishes a report (§4.6).
- Copy conflict: Campaigns page says "bank transfer only, no card details";
  invoice offers "Pay online by card".

### 3.3 Artist

- **"Sponsor offers" counts withdrawn and completed proposals as pending**
  (`offers/page.tsx:26`, `ArtistHome.tsx:35`) — filter on status.
- "Brand enquiries waiting" and "Brand enquiries" list old direct
  brand↔artist threads, which can no longer get new messages — remove.
- **Discover campaigns** is still a self-serve marketplace ("when brands
  publish briefs", "Available £" from the old fee formula). Decide: keep as
  "register interest in admin campaigns" with corrected copy and no £, or
  remove (decision §8.4).
- Old-model money tiles on `sponsored/[id]` — and for the artist they're also
  *wrong*: the artist can't read the campaign's package margin, so they see a
  different fee/net from the brand. Remove the money tiles for the artist
  entirely; the artist's figures are ticket sales and codes.
- "Worst-case discount cost … incl. X% admin margin" shows the admin margin to
  the artist (`RewardEngineDisplay.tsx:155-161`) — admin only.
- Check-in panel copy still says "share with the artist" (written for the
  brand).
- Link each sponsorship to its own campaign brief rather than the list.

### 3.4 Audience

- **Reward tracker → "Your codes"**: Home, My rewards and My events still
  show £ amounts, "Reward released: £x", "Total rewards released", "Pending
  release", "consent to share payout details", "claim your reimbursements".
  Replace with code status per event.
- **Issuing a code should complete the participation.** Today
  `issueCodeFromTier()` leaves the row at `attendance_verified`, so the step
  tracker never finishes and the page says "your reward is being processed"
  forever. Set `reward_released` (label it **"Code issued"**) in the same
  call.
- Step tracker gets a **survey** step, and the check-in success screen says
  "complete the post-event survey to get your code" — today it says "your
  reward is on its way".
- "How it works" on the event page says "add your ticket reference" before
  selection — the real order is register → selected → upload ticket.
- **Archived survey bug:** the reward gate counts *archived* post-event
  surveys, but audiences are only offered *published* ones — archive a
  survey early and nobody left can ever get a code. Offer archived-but-
  unanswered surveys to eligible participants, or don't count archived ones
  in the gate.
- Registration doesn't re-check the deadline or event status on the server
  (`confirmRegistration`, `registerPendingEvent`, which even accepts
  completed events).
- Code release stays manual (admin button, bulk "issue to eligible"). Option:
  auto-issue when the post-event survey scores `pass` — decision §8.3.
- Notification templates still mention payout details, ticket reference and
  £ amounts (0017) — update via a migration.
- Marketing/terms copy: "ticket reimbursements", "before anything is paid out
  to audience members" (`about/page.tsx`, `lib/terms.ts`) — terms text is the
  client's; flag to Sakshi.

### 3.5 Mobile spots

- Survey Likert: 5 fixed 56px tiles in a grid — overflows 320–375px screens
  (`surveys/[templateId]/fields/ChoiceField.tsx:66-80`). **Fix before
  testing** — this is the audience's main screen.
- Long discount codes and survey links don't wrap (`rewards/page.tsx:138`,
  `RewardEngineDisplay.tsx:138`, `OrderFormDocument.tsx:197`) — `break-all`.
- Messages: thread list stacks above the thread on phones; long URLs in
  bubbles don't wrap.
- `offers/page.tsx` rows don't wrap; `rewards/page.tsx:77` row doesn't wrap.

### 3.6 Messages page (all roles)

- Brand/artist land on the empty "With artists & sponsors" tab by default —
  default to the team tab, and hide the partner tab for users with no old
  threads.
- Thread list ordered by thread creation, not latest message.
- "Contact Live·En·Synergy" from a sponsored event doesn't post any context,
  so admin can't tell which event it's about.

---

## 4. Insights — the new analysis module

### 4.1 What the admin gets

A separate page, **`/dashboard/admin/insights`**, reached from Reporting &
analysis (each row gets **Analyse**):

1. **Pick a campaign** — completed campaigns first; live ones allowed with an
   "interim — survey still open" label.
2. **Pick what to analyse** — its pre-event and/or post-event survey; include
   "in review" responses or not; which cross-tabs (suggested automatically,
   editable); AI summary on/off.
3. **Analyse** — the page returns at once with "Running…", and fills in as
   each step finishes. Nothing heavy runs inside the page request, so the
   page never hangs, however many responses there are.
4. **Report** at `/dashboard/admin/insights/[runId]`:
   - **Executive summary** (AI) — 5–8 sentences, every number linked to the
     table it came from.
   - **Key findings** (AI-ranked, figures rendered by us from the data).
   - **Cross-tabs** — e.g. "Would buy again" by age band — counts, row %,
     significance flag, effect size.
   - **Pre vs post** — shift in awareness / perception / consideration, the
     same person matched across both surveys.
   - **Open text** — themes with counts and share, 2–3 anonymised example
     quotes each.
   - **Caveats** — sample size, response rate, quality rejections, interim.
   - Download **PDF** (print stylesheet) and **CSV** of every table.
5. **Re-run** any time; every run is kept, so the report a brand saw last
   week stays exactly as it was. A run says **"N new responses since"** when
   it's out of date.

The existing results page stays the live, always-current view; Insights is
the considered, snapshot report.

### 4.2 How it runs (scalable, never blocks a page)

```
Analyse ─► insert analysis_runs (queued) ─► page shows "Running…"
              │
              ├─ after(): run step 1 now           (fast path, seconds)
              └─ pg_cron every minute ─► /api/cron/analysis  (resume / retry)

steps:  1 snapshot  →  2 statistics (SQL)  →  3 open-text themes (AI, batched)
        →  4 executive summary (AI)  →  done
```

- **`survey_analysis_runs`** (admin-only RLS): campaign, templates, options,
  `status` (queued / running / done / failed), `step`, snapshot (respondent
  high-water mark, counts), `results jsonb`, `ai jsonb`, model, tokens,
  cost, error, who ran it, timings. One running run per campaign (partial
  unique index).
- **Each step is short and idempotent**, writes its output, then moves the
  run on. A Vercel function time limit or a crash just means the cron
  picks it up a minute later. Same pattern as the email outbox
  (`claim_…` with `skip locked`).
- **The page polls the run's status** (small client component, every 3s while
  running) — no websockets needed.

### 4.3 Statistics — in Postgres, not in the browser

- **Cross-tab RPC** `survey_crosstab(template, row_var, col_var,
  include_review)` — one `GROUP BY` over `survey_answers` joined to
  `survey_responses`. 5,000 respondents × 20 questions is 100k rows: well
  under a second. Add an index on `survey_answers (question_id)`.
- **Variables you can cross-tab:**
  - Demographics already held: age band, gender, country (same source as
    the export).
  - Any single-choice, dropdown or yes/no question — this is where
    **employment status** and **ticket type** come from: they aren't
    profile fields today, so they're survey questions. (A standard
    "About you" question block for the survey builder is §8.5.)
  - Scale questions, grouped (e.g. 1–2 / 3 / 4–5).
  - Multi-select: each option as its own yes/no.
- **Per table:** counts, row % and column %, **chi-square p-value** and
  **Cramér's V** (effect size), flagged when expected counts are under 5
  (the test isn't reliable there — we say so instead of showing a false
  "significant").
- **Suggested tables:** each demographic × each key question, capped (~30)
  so a report stays readable; admin adds or removes.
- **Pre vs post:** pair questions with a `measure_key` (planned in
  `survey-results-analysis-plan.md` slice C); match people by the salted
  person key (the same `PER-` id as the export) — both all-respondents and
  matched-pairs figures, with the n of each.
- **Suppression:** anything that leaves the admin view shows cells under 5
  as "<5" (same rule as brand results).

### 4.4 AI step

- **What the AI sees:** the computed tables (numbers, not raw rows), and the
  open-text answers with emails, phone numbers, URLs and postcodes stripped
  out first. Never names, emails or ids.
- **Open text at scale:** batches of ~200 answers → themes per batch → one
  merge call → final themes with counts. Works the same at 50 or 5,000
  answers.
- **It can't invent numbers.** The AI returns structured JSON (summary,
  findings that cite table ids, themes, caveats). The page renders figures
  from our data and refuses findings that cite tables that don't exist.
- **Prompt injection:** open text is passed as quoted data with instructions
  to treat it as such; the output is schema-checked; nothing the model says
  is executed.
- **Provider:** behind one small adapter (`src/lib/ai.ts`) with env
  `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`. The standup leaned towards OpenAI
  or OpenRouter. **OpenRouter** lets Sakshi compare models (GPT, Claude, …)
  on the same report before settling. If no key is set, the module still
  produces the statistics; the AI sections just say "not configured".
- **Cost control:** token caps per step; per-admin rate limit
  (`rate_limit_hit()`); monthly cap env; cost recorded on each run. Rough
  size: a 5,000-response survey with three open questions is a few hundred
  thousand tokens — pennies to low pounds per run depending on model.
- **Minimum data:** no AI summary under 10 counted responses ("not enough
  responses to summarise reliably").

### 4.5 Privacy (needs a client decision before switching AI on)

Sending survey answers to an AI provider makes them a **processor**:

- choose a provider / OpenRouter route with zero data retention and no
  training on API data;
- add it to the privacy notice and the processor list;
- joint-controller campaigns: the brand's order form consents should cover
  it.

Statistics need none of this — only the AI step. Decision §8.1.

### 4.6 Sharing with the brand

This becomes slice D of `survey-results-analysis-plan.md` (the brand's
"Campaign Performance Report"):

- Admin reviews a run, edits the summary if needed, and **publishes** it.
- The brand sees the published run only: suppression applied, no open-text
  quotes unless decided (decision 1 in that plan), PDF download.
- Notification `report.published` to the brand.

### 4.7 Edge cases

| Case | Handling |
|---|---|
| Survey still open | Allowed; report labelled interim; "N new since" after |
| Very few responses | Stats shown with caveats; AI skipped under 10; brand publish blocked under 5 |
| Questions edited after responses | Answers keyed by question id (deletes already blocked); report shows the question text at run time |
| Responses rejected after a run | Run is a snapshot; "out of date" badge; re-run |
| Two admins click Analyse | One running run per campaign; the second sees the running one |
| AI provider down / key wrong | Stats saved; AI step marked failed with the reason; "Retry AI" re-runs only that step |
| Public-survey respondents (no account) | Included; demographics from their own answers |
| Pre without post (or vice versa) | Comparison section omitted with a note |
| 5,000+ responses | SQL aggregates + batched AI; nothing loads all rows into the page |
| Personal data in open text | Stripped before AI; quotes shown only after admin review |

### 4.8 Migrations (all additive)

- **0061** — participations guard + `confirm_attendance()` (§1).
- **0062** — `survey_analysis_runs`, `survey_crosstab()`, `survey_answers
  (question_id)` index, `measure_key` on `survey_questions`, claim function
  for the runner; `report.published` notification event + settings +
  template.
- **0063** — notification template text for the code model (§3.4).

---

## 5. Messaging — needs a decision

Today each user has **one** thread with the team. The standup notes say both
"one thread per brand" (Ketan) and that Sakshi tried creating several
threads. The current UI is misleading: "+ New thread with the team" reopens
the same thread, and the campaign reference passed by "Message brand" is used
only the first time.

| Option | What changes |
|---|---|
| **A. One thread per user (keep)** | Rename the button to "Open your thread"; each message from a campaign/event page posts a small "About CMP-00007" context line |
| **B. One thread per campaign + a General thread** | Thread per campaign (the table already has `campaign_id`); a "General" thread for everything else; migration for a one-thread-per-user-per-campaign unique rule |

Recommendation: **B** for brands (campaigns are how admin works), with A's
context line for artists. Small either way once decided.

---

## 6. Domain go-live (`www.liveensynergy.com`) — checklist

1. GoDaddy: `www` CNAME → the Vercel value (done 9 Oct); apex `@` A record →
   Vercel's IP; domain forwarding off. Both green in Vercel.
2. Vercel: `www` primary; apex and `liveensynergy-rho.vercel.app` redirect to
   it (keeps already-shared QR codes and email links working).
3. `NEXT_PUBLIC_SITE_URL=https://www.liveensynergy.com`, then **redeploy**.
4. Supabase Auth: Site URL + Redirect URLs.
5. Stripe webhook URLs; Resend webhook URL; pg_cron drain-outbox URL;
   Turnstile allowed hostnames.
6. Resend sending domain (`mail.liveensynergy.com`: SPF, DKIM, DMARC),
   then `EMAIL_FROM`.
7. Repo: `playwright.config.ts` default URL and `lessons.md` live-site row.

---

## 7. Weekend testing — practical notes

- `name+1@gmail.com`, `name+2@…` all work for sign-up; each needs its email
  confirmed (Supabase sends that directly — it isn't caught by the
  non-production redirect).
- **Audience accounts each need a different phone number** (last 10 digits
  are unique across audience accounts by design — one person, one account).
  Use the UK range reserved for drama, **07700 900000–900999**: valid-looking,
  never a real person.
- Brand and artist accounts may reuse a number.
- Bugs and feedback: screenshots to WhatsApp or the shared Google Sheet (per
  the standup); the in-app Feedback button also works and files a reference.

---

## 8. Decisions needed

1. **AI on survey answers** — OK to send anonymised answers to an AI
   provider? Which (OpenAI / OpenRouter)? Privacy notice updated first.
2. **Cross-tab variables** — which demographics are standard (age, gender,
   employment, ticket type …)? Add a standard "About you" block to every
   survey?
3. **Auto-issue codes** when the post-event survey passes, or keep admin
   issuing (bulk button)?
4. **Artist "Discover campaigns"** — keep (register interest, no £) or remove?
5. **Brand sees participant names** (open from the Admin Portal tracker).
6. **Check-in window** — event day only, or day before/after too (time
   zones, late events past midnight)?
7. **Auto-complete events** whose date has passed — status change nightly,
   or only shown as completed?
8. **Messaging** — option A or B (§5).
9. **Retire the cash reward path completely** (release £, payout consent,
   remaining budget)? Existing history stays readable either way.

---

## 9. Suggested order

| # | Work | Size | Needs |
|---|---|---|---|
| 1 | §1 security: participations guard, check-in RPC, brand verify removed | S–M | nothing — do now |
| 2 | Dead links, offers status filter, Likert on mobile, archived-survey bug | S | nothing |
| 3 | §3 old-model clean-up (admin participants/overview/events, audience codes, brand/artist money tiles) | M | decision 9 (assumed yes) |
| 4 | §4 Insights: runs table, runner, cross-tabs, pre/post, report page, PDF/CSV | M–L | decision 2 |
| 5 | §4.4 AI step | M | decision 1 |
| 6 | Brand campaign page + published report | M | decisions 5 and publish rules |
| 7 | §5 messaging | S | decision 8 |
| 8 | §6 domain | settings | DNS green |
