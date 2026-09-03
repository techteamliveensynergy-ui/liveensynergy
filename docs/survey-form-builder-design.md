# Survey form builder — native drag-and-drop design

Source: `docs/New-model/_txt/Survey .txt` (quality-engine spec) plus the
build-vs-buy recommendation written up for Ketan's 24 Aug standup action item
(build in-house, not Typeform/Jotform). This is Phase 3 of
`docs/new-model-implementation-plan.md` — the detailed design for the piece
that plan only summarises. Confirmed net-new: a repo-wide search for
"survey" across `src/` and `supabase/migrations/` returns zero hits as of
26 Aug 2026.

**Fuller build plan:** `docs/New-model/Survey Response Quality Engine - Build
Plan.docx` (`_txt/` companion alongside it) is the complete build plan for
all 7 stages of this phase — the bot/fraud screen, the nine-signal quality
engine, the admin review queue, the brand-facing access/export rules — of
which this doc's §3 (the admin builder) is one section. Its own §08 lists
seven still-open decisions; the one that bears on the builder specifically
is **"can a published survey be edited once responses exist?"** — its
proposal (reorder/add allowed, delete blocked) is unconfirmed, which is why
the builder currently takes the stricter interim stance of no question edits
at all while `published` (§3 below) rather than guessing at the answer.

Two audiences, two UIs: **admin** composes a survey by dragging question
blocks into an ordered form (this doc's main subject); **participants**
(audience members) fill it in as a normal form — no drag-and-drop on that
side except where a question type itself is a ranking task.

---

## 1. Question types

Everything the two source docs actually ask for, mapped to a concrete field
type:

| Type | Where it's asked for | Config it needs |
|---|---|---|
| Single choice (radio) | Brand-awareness, purchase-intent style questions | Options list, correct/expected answer (only for attention checks) |
| Multiple choice (checkbox) | "Which of these..." style consumer-preference questions | Options list, min/max selectable |
| Rating / scale | Brand perception, favourability measurement | Min, max, step, end labels (e.g. "Not at all" → "Extremely") |
| Yes / No | Eligibility screening, attendance-style gates | — |
| Dropdown / select | Demographic questions (age range, region) | Options list |
| Short text | Open-ended brand feedback | Max length |
| Long text (paragraph) | "Open-ended consumer feedback" | Max length |
| Ranking | Consumer-preference ordering | Options list (drag to reorder — participant-facing drag, not just admin) |
| Number / slider | Purchase-intent scoring, quantities | Min, max, step |
| Attention check | Quality-engine signal #2 — "did they follow instructions" | An expected answer, hidden from admin's benefit-copy view, scored not reported |
| Hidden / system field | Eligibility + duplicate-detection prefill from the respondent's existing profile (email, phone, role) | Which profile field it maps to — never rendered, never editable |

`is_attention_check` and the hidden/system type are the two that don't behave
like normal questions: the first is scored, not reported to the brand; the
second is never shown to the respondent at all — it rides along on the
response so the quality engine's duplicate-detection signal has something to
compare against without asking the respondent to retype data the platform
already has.

## 2. Data model

Additive migration, following the repo's existing shape (`profile_id`-style
ownership scoping, `security definer` helpers for cross-table RLS, a
human-facing sequential reference isn't needed here — surveys aren't linked
to from outside the app the way `campaigns`/`sponsored_events` are).

```sql
create table survey_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) not null,
  kind text not null check (kind in ('pre_event', 'post_event')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  title text not null,
  created_by uuid references profiles(id) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table survey_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references survey_templates(id) on delete cascade not null,
  order_index int not null,
  type text not null check (type in (
    'single_choice', 'multiple_choice', 'scale', 'yes_no', 'dropdown',
    'short_text', 'long_text', 'ranking', 'number', 'attention_check', 'hidden_field'
  )),
  prompt text,                    -- null for hidden_field
  options jsonb,                  -- [{ "label": "...", "value": "..." }, ...]
  config jsonb not null default '{}'::jsonb,  -- min/max/step/expected_answer/profile_field per type
  required boolean not null default true,
  unique (template_id, order_index)
);

create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references survey_templates(id) not null,
  participation_id uuid references participations(id) not null,
  started_at timestamptz not null,   -- client-reported, question-shown timestamp
  submitted_at timestamptz not null default now(),
  quality_score int,                 -- 0-100, null until scored
  quality_status text not null default 'pending' check (
    quality_status in ('pending', 'pass', 'review', 'reject')
  ),
  duplicate_of uuid references survey_responses(id),  -- set by the quality engine, not the respondent
  unique (template_id, participation_id)
);

create table survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid references survey_responses(id) on delete cascade not null,
  question_id uuid references survey_questions(id) not null,
  value jsonb not null,             -- shape depends on question type
  shown_at timestamptz,             -- per-question timing, feeds completion-time + straight-lining checks
  answered_at timestamptz,
  unique (response_id, question_id)
);
```

`participation_id` is what ties a response back to `campaigns` → `brands`
for the brand-facing "Participants Info" panel (`docs/new-model-implementation-plan.md`
§6) — the join already exists via `participations`, no new link needed.

**RLS:** template authoring is admin-only (`is_admin()`, already exists —
`supabase/migrations/0001_schema.sql:72-75`). Response/answer *write* is the
respondent's own participation, checked the same way `participations` itself
is scoped today. Response/answer *read* for the brand needs an anonymised
view — mirror the existing `public_*_profiles` pattern (explicit column
list, no respondent identity) rather than exposing `survey_answers` directly,
since "Anonymised Name | Survey Completed | Verified Attendance" is exactly
what the Sponsored Events screen is meant to show and nothing more.

## 3. Admin builder — the drag-and-drop UI

**Library:** none of the existing dependencies do this (`package.json` has no
`dnd`/`sortable`/`drag` package today). Recommend **`@dnd-kit/core` +
`@dnd-kit/sortable`** — small, tree-shakeable, keyboard-accessible out of the
box (a screen-reader admin can still reorder questions), and it's the same
primitive that would drive the participant-facing "ranking" question type,
so one library covers both instead of two.

**Layout — three panes:**

1. **Palette (left)** — one draggable card per question type from §1's
   table. Dragging a card onto the canvas inserts a new question of that
   type at the drop position; clicking it appends to the end (drag isn't the
   *only* way in — keyboard/click-to-add is the accessible fallback).
2. **Canvas (centre)** — the ordered list of questions on this template.
   Each question renders as a collapsed summary card (type icon + prompt)
   with a drag handle; dragging within the canvas reorders. Uses
   `@dnd-kit/sortable`'s vertical list strategy — this is the same pattern
   as any reorderable list, nothing bespoke.
3. **Inspector (right)** — the selected question's config: prompt text,
   options editor (add/remove/reorder option rows — a small drag-sortable
   list itself), required toggle, and the type-specific config from §1
   (scale range, attention-check expected answer, which profile field a
   hidden field maps to).

**State model:** the builder is a client component holding the question list
in local state while dragging — persisting on every drag frame would be both
slow and noisy. A single **"Save"** action serialises the whole ordered list
and upserts it server-side in one transaction (delete-and-reinsert or a
diffed upsert, either is fine since `survey_questions` has no independent
identity participants ever reference before publish). This matches the
repo's existing convention of an explicit action rather than autosave — nothing
else in the dashboard autosaves today, so this doesn't introduce a new
interaction pattern for admins to learn.

```ts
// src/app/dashboard/admin/surveys/actions.ts (new domain, same shape as the other 16)
export async function saveSurveyTemplate(
  templateId: string,
  questions: SurveyQuestionDraft[],
): Promise<SurveyBuilderState>
```

A **live preview** toggle (renders the same component the participant sees,
read-only) belongs in the builder from day one — question order and scale
labels are hard to judge from the collapsed admin summary cards alone.

**Publish vs. draft:** a template stays `draft` (editable, no responses
possible) until admin explicitly publishes it. Once `published` and at least
one response exists, question *deletion* should be blocked (reordering and
adding new questions is still fine) — otherwise a live survey's completion-
time and straight-lining signals lose their meaning mid-flight.

## 4. Participant-facing renderer

Reads the `published` template's questions in `order_index` order and
renders one field component per type from §1, reusing the existing
`.input` / `.textarea` / `.select` primitives from `globals.css` rather than
introducing a parallel form design system. Records `shown_at` when a
question scrolls into view / becomes active and `answered_at` on change —
this per-question timing is what feeds the quality engine's completion-time
and straight-lining signals; a single start/submit timestamp on the whole
survey isn't granular enough for those two checks.

Hidden fields never render — their value is read straight from the
respondent's profile at submit time and inserted into `survey_answers`
alongside what the respondent actually typed.

## 5. Quality engine hook

Out of this doc's scope in detail (see the standup follow-up memo for the
9-signal table), but the interface this builder needs to support: on
submit, a server-side scoring function reads `survey_answers` + `shown_at`/
`answered_at` deltas + each question's `config` (expected answers for
attention checks, option sets for straight-lining variance) and writes
`quality_score` + `quality_status` back onto `survey_responses`. Reward
release (Phase 4 of the implementation plan) reads `quality_status = 'pass'`
— nothing about the builder itself needs to know about rewards.

## 6. Build order

1. **Done (migration `0032`).** Schema for `survey_templates` +
   `survey_questions` only — a `text` + `check` column, not an enum, for
   `kind`/`status`/`type` (see the migration's own note on why). Deferred:
   `survey_responses`/`survey_answers`, which land with step 2/4 below once
   there's something to write into them.
2. **Done (migration `0033`).** Participant-facing renderer at
   `src/app/dashboard/surveys/[templateId]/`, against **real published
   templates** created via the admin builder — the "hand-seeded template"
   this step originally called for is moot now that step 3 shipped first.
   Adds `survey_responses`/`survey_answers`, the `survey_participation_for()`
   eligibility function (campaign → confirmed/completed sponsored event →
   participation, gating post-event kind on `attendance_verified`/
   `reward_released`), the sanitised `survey_form_questions` view (strips
   `config.expected_answer`, excludes `hidden_field` rows), and the
   `submit_survey_response()` RPC — the same "no client insert policy,
   security-definer RPC instead" idiom as `redeem_reward_code()`. Per-question
   `shown_at`/`answered_at` via `IntersectionObserver`, first-write-wins.
   Bot/fraud screening (stage 1-2 of the build plan's §03) was deliberately
   deferred here — see item 3a below, now done.
   **Found and fixed a real React 19 bug along the way**, worth flagging for
   any other `<form action={formAction}>` + `useActionState` form in this
   repo that holds meaningful in-progress state: React resets a form's native
   controls after an action call resolves — success *or* an app-level
   validation error alike, since returning `{ error }` doesn't "throw" from
   React's own perspective. That's harmless for a single edit-in-place form
   (a remount picks up correct fresh values either way — see the
   `key={updated_at}` note on `SurveyTemplateForm`), but it silently wiped
   every radio/checkbox answer on this multi-field participant form the
   moment one question failed validation. Fixed by calling `formAction()`
   from a plain `onSubmit` wrapped in `startTransition()`, sidestepping the
   `<form action>` wiring (and its auto-reset) entirely.
3. **Done.** Admin builder UI (§3) — palette, canvas, inspector,
   save/publish, at `src/app/dashboard/admin/surveys/`. Built ahead of step 2
   since it was the piece explicitly asked for first; it needed no
   participant-side plumbing to be useful on its own. Two deliberate
   deviations from this doc, both because there are no responses yet to make
   the stricter rule costly: **no question edits once `published`** (§7 Q1 —
   unpublish, edit, republish, rather than allowing in-place edits on a live
   survey) and **archive-only deletion**, matching the rest of the admin
   dashboard's no-hard-delete convention. The live-preview toggle (§3) is
   deferred to when the renderer exists to preview.
3a. **Done (migration `0034`).** Bot/fraud screening (build plan §03 stages
   1-2) ahead of `submit_survey_response()` — a honeypot field, a Postgres-
   backed rate limiter (`survey_submission_gate()`, per-account and per-IP,
   short-burst + rolling-24h windows — a new `survey_submission_attempts`
   table doubles as both the limiter's storage and the fraud audit log the
   build plan's §04 asks for), and Cloudflare Turnstile token verification
   (`src/lib/turnstile.ts`). Turnstile was chosen over Vercel BotID: its free
   tier is the real managed challenge (BotID's free tier is challenge-
   integrity-only, real detection is billed), and its deterministic dummy
   keys (site `1x00000000000000000000BB` / secret
   `1x0000000000000000000000000000000AA`) work cleanly against this repo's
   Playwright-driven release gate, which BotID's docs don't address for a
   local `next start`. The provider sits behind one function
   (`screenSurveySubmission()` in `src/lib/survey-abuse.ts`) so swapping it
   later doesn't touch the gate ordering or the rate limiter. A filled
   honeypot returns the same success redirect as a real submission — nothing
   tips off the bot operator; a rate-limit or Turnstile failure is a visible,
   actionable error, since both have real false-positive paths (a confused
   human, shared venue wifi, a browser extension) a honeypot doesn't.
4. **Done (migration `0035`).** Quality engine scoring (§5) —
   `score_survey_response()`, called from `submitSurveyResponse()` right
   after a successful `submit_survey_response()`, best-effort (never blocks
   the redirect; a `pending` response can be re-scored later from the review
   queue). All 9 signals from the standup follow-up memo are implemented,
   rescaled to only the ones applicable to a given template/response —
   `behaviour` and `fraud_signals` stay permanently not-applicable this pass,
   both needing interaction/Turnstile telemetry at a granularity step 3a
   doesn't capture. Contradiction rules (§2's schema sketch) turned out to be
   genuinely missing from 0032/0033, so this migration adds
   `survey_contradiction_rules` and the admin builder grew a small
   "Contradiction rules" panel (`ContradictionRulesEditor.tsx`) to define
   them — otherwise that signal could never fire. New:
   `/dashboard/admin/surveys/responses` review queue (list + 4-block detail
   screen: meta, signal breakdown, full answer transcript, pass/review/reject
   decision) at `src/app/dashboard/admin/surveys/responses/`.
5. **Done (migration `0036`).** Reward-tier gating hookup (implementation
   plan Phase 4) — `src/lib/data/reward-gate.ts`'s `decideRewardGate()`
   derives which survey kind gates a campaign (post-event takes precedence
   over pre-event when both exist) and maps its `quality_status` straight to
   a gate verdict; `issueRewardCode()` and `adminUpdateParticipation()`'s
   `release` case both refuse when the gate disallows, redirecting with
   `?notice=gate` (the same "form unmounts on success" reasoning as
   `runSelectionDraw()`'s `?notice=draw`). A campaign with no configured
   survey gates `open` and issues freely — every pre-0032 sponsorship has no
   template, so the gate only ever *removes* discretion from campaigns that
   opted into surveys. No admin override past a refusal was built (the
   review queue's own verdict flip *is* the override); the remaining-budget
   guardrail on top of the survey gate is a separate, deferred money-
   semantics decision.

## 7. Open questions

| Question | Why it matters |
|---|---|
| Can a published template with responses have questions *edited* (not just blocked from deletion), or does any change require a new template version? | Affects whether `survey_questions` needs versioning or a simple `published` lock is enough |
| Does "up to 15 research questions, depending on package" (Packages Details doc) mean the builder enforces a per-package question cap? | Needs the package/tier decision from the implementation plan §3 resolved first |
| Is the attention-check question shown at a fixed position or randomised per respondent? | Changes whether `order_index` is absolute or has an "always last third" style constraint |
