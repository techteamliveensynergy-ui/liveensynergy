# Survey results & analysis — next-phase plan

Status: **plan, not built.** Drafted 8 Oct 2026 from the 7 Oct standup
("Analyze Reports"), the client's *Survey Response Quality Engine — Build Plan*
§05–§07 (`docs/New-model/_txt/`), *Packages Details* (Insights / Measurement)
and *Brand Portal* ("Campaign Performance Report").

This is step 7 of the client's build order — "Results, analytics & exports" —
the last survey step not yet built. Steps 1–6 (tables, survey screen,
submission pipeline, builder, quality engine, reward gating) are live, plus
public surveys, branding and the response cap (0056).

> The client's own words: *"Collecting responses is only half the product —
> the campaign performance report is what the brand actually bought."*

---

## 1. What exists today (what we build on)

| Piece | Where | Note |
|---|---|---|
| Questions | `survey_questions` (0032) | 11 types. Likert = `single_choice` + `config.display_style='likert'`; picture choice = option images; scale may carry an N/A (`config.na_label`). |
| Responses | `survey_responses` (0033/0035/0037/0043) | `quality_score`, `quality_status` (pending/pass/review/reject), `signal_breakdown`, `duplicate_of`. Public responses have **no `participation_id`** — they carry `respondent_*`, `age_range`, `respondent_profile_id`. |
| Answers | `survey_answers.value jsonb` | string (single/dropdown/yes-no), array (multi/ranking), number (scale/number), string (text). Plus `shown_at` / `answered_at`. |
| Link to campaign | `survey_templates.campaign_id` | The **only** path from a public response to a campaign/brand. Participation responses can also go via `participations → sponsored_events`. |
| Admin screens | `admin/surveys`, `admin/surveys/responses` (+ `[id]`) | List with n / cap, review queue, single response. **No aggregation, no charts, no survey export.** |
| Brand / artist | `sponsored_event_survey_completions` view (0036) | Completion only. It inner-joins participations, so **public responses are invisible** to brands today. |
| CSV precedent | `admin/participants/export/route.ts` | RFC 4180 cells, DD/MM/YYYY dates, honours page filters. Copy this. |
| Order form | `campaign_order_forms` (0054) | `survey_type`, `survey_question_count`, `research_questions`, `approx_participants` — the *agreed* research scope. No FK to a template (shares `campaign_id`). |
| Libraries | — | No charting, CSV, xlsx or PDF library. |

---

## 2. Who sees what (the client's §05 rule, unchanged)

| Role | Sees | Never sees |
|---|---|---|
| Admin | Everything, incl. identity in exports | — |
| Brand | Aggregated results, completion rate, quality **mix** (aggregate), anonymised participant list (`RSP-00042` · completed · verified attendance), anonymised CSVs | Names, emails, phones, raw answers tied to a person, quality scores per person, attention-check questions, hidden-field questions |
| Artist / organiser | Completion counts for their own event | Answers, identities |
| Audience | Their own response + reward status | Anyone else's answers, their own score/signals |

**How it's enforced:** brand data comes from `security definer` RPCs that
return *already aggregated* / *already anonymised* rows, with an explicit
column list — never from a brand RLS policy on `survey_responses` /
`survey_answers` (a policy can't hide columns; it would hand over
`quality_score` and the respondent columns). The same technique as 0033/0036.

---

## 3. What we build — four slices

Each slice ships on its own and is useful on its own.

### Slice A — Admin results page + question summary (Medium)

`/dashboard/admin/surveys/[id]/results`

- **Headline numbers:** submitted, passed, in review, rejected; responses vs cap
  (0056); completion rate; median time to complete (from `answered_at` spread);
  **cost per completed survey** = order-form campaign fee ÷ passed responses
  (a Measurement line in *Packages Details*).
- **Per-question block**, drawn by type:
  - single / dropdown / yes-no / likert / picture → horizontal bars, count + %.
  - multiple choice → bars, % of *respondents* (not of answers — they sum >100%, label it).
  - scale → distribution + mean + median; N/A counted separately, **excluded from the mean**.
  - number → mean, median, min/max, spread.
  - ranking → average position per item (lower = better) + % ranked first.
  - short / long text → readable list, newest first, with a search box.
  - attention check, hidden field → **not shown** as results (attention-check pass rate goes in the quality panel).
- **Quality mix:** pass / review / reject split and the top signals that fired
  (from `signal_breakdown`).
- **Filter:** by default only `pass` responses count; a toggle adds `review`
  (and `reject`, admin-only audit).
- **Planned vs actual:** the order form's `survey_question_count` and
  `approx_participants` next to the real figures — so a mismatch is visible
  before the brand sees the report.
- **Charts are plain HTML/CSS bars** (width = %), not a chart library: zero new
  dependency, prints cleanly, works in the PDF. Revisit only if the client
  wants interactive charts.

Computed in one `survey_results(template_id, include_statuses[])` SQL function
(admin-checked) returning JSON per question — aggregating in Postgres rather
than shipping every answer row to the server component.

### Slice B — CSV exports (Small–Medium)

The four files from §06, as route handlers next to the participants export:

| Export | One row per | Admin | Brand |
|---|---|---|---|
| Survey responses (wide) | respondent | name/email/phone + answers | `RSP-xxxxx` + demographic answers |
| Answer-level detail (long) | answer | ✓ | ✓ anonymised |
| Participants (extended) | participant | existing export + survey completed, verdict, reward-code status | — |
| Question summary | answer option | ✓ | ✓ |

- Multi-select joined in one cell (`; `), ranking written in order, dates DD/MM/YYYY HH:mm.
- **Anonymisation happens when the file is built** (the brand route only ever
  selects through the anonymised function) — there is no brand file that
  contains identity.
- Needs a stable respondent reference: new `survey_responses.reference`
  (`RSP-00001`, sequence + backfill — migration).

### Slice C — Pre vs post comparison + demographics (Medium)

- **Pairing questions across two surveys.** Pre and post are *separate
  templates*, so "the same question" needs an explicit link: add
  `survey_questions.measure_key text` (admin picks e.g. `brand_awareness` on
  both). Matching by prompt text breaks the first time someone fixes a typo.
- Comparison shown as a shift: % top-2-box before → after, mean before → after,
  with the n of each side. Only option values present on **both** sides are
  compared; options added later are listed, not silently merged.
- **Demographics:** split any question by age band, gender, region/country —
  from `audience_members` (participation responses) or `age_range` /
  respondent columns (public responses).
- **Small-number suppression (brand only):** any demographic cell with fewer
  than **5** respondents shows "<5" — otherwise "the one 55–64 woman in
  Leeds" is identifiable even without a name. Admin sees exact numbers.

### Slice D — Brand "Campaign Performance Report" (Medium)

`/dashboard/campaigns/[id]/report` — the thing the brand bought.

- Sections mirror *Packages Details* → **Measurement** (participation, completed
  surveys, completion rate, cost per completed survey, pre/post shift in
  awareness / perception / consideration) and **Insights** (audience
  demographic profile, per-question results, open-ended responses).
- Data only from `brand_survey_report(campaign_id)` (definer, checks the caller
  owns the campaign, returns aggregates + anonymised lists, applies the <5
  rule, drops attention/hidden questions, `pass` only).
- **Includes public-survey responses** (they belong to the campaign via the
  template) — today's completion view misses them.
- **Download PDF** via the print stylesheet, same as the order form.
- **When it opens:** the brand sees it only once admin **publishes** the report
  (new `survey_templates.results_published_at` or a per-campaign flag) — so
  half-reviewed data or an empty survey never reaches the brand. Notification
  `report.published` (event + settings + templates in the migration).
- Artist: a completion count card on their sponsored-event page, now
  including public responses.

---

## 4. Edge cases to design for (and how)

| Case | Handling |
|---|---|
| Survey with 0 or very few responses | Empty state; brand report not publishable below a minimum (suggest 5) without an admin override. |
| Question edited / option removed after responses exist | Aggregate by stored option **value**; values with no current label show as "(removed option)". |
| Option relabelled | Value unchanged → counts merge correctly; label shown is today's. |
| Question deleted after responses | Answers remain; show under "Retired questions" for admin, hidden from brand. |
| Scale with N/A | N/A counted but excluded from mean/median. |
| Multiple choice percentages | % of respondents who saw the question; note "sums to more than 100%". |
| Conditional / skipped optional questions | Base = respondents who **answered** that question; show the base (n) on every block. |
| Duplicate responses (`duplicate_of`) | Excluded with rejects; never double-counted. |
| Pending review responses | Not in brand numbers; admin toggle only. Report shows "x responses still in review" to admin before publishing. |
| Public + participation responses in one campaign | Both counted; source shown to admin as a split. |
| Open text containing names / phone numbers | Brand sees open text → **decision needed** (see §6): admin approve/redact per answer, or brand sees a sample only. |
| Re-identification via demographics | <5 suppression (Slice C). |
| Response cap reached mid-campaign | Report notes "closed at cap (n/cap)". |
| Pre survey run, post survey not yet | Comparison panel says "post-event survey not run yet", no zero bars. |
| Brand with several campaigns | Report is per campaign; brand picks the campaign. |
| Large surveys (thousands of answers) | Aggregation in SQL; exports streamed in pages of 1,000. |
| Rate / abuse on export routes | Reuse `rate_limit_hit()` (0050) on brand export routes. |

---

## 5. Migrations this needs (all additive)

1. `survey_responses.reference` (`RSP-00001` sequence + backfill).
2. `survey_questions.measure_key` (nullable) for pre/post pairing.
3. `survey_templates.results_published_at` (+ `results_published_by`).
4. `survey_results()` (admin) and `brand_survey_report()` / `brand_survey_export()` (brand, definer, ownership-checked) functions.
5. `report.published` notification event + settings + templates (three-step insert, or `notify()` no-ops).

Apply each before the code that reads it ships, and log in
`docs/database-migrations.md`.

---

## 6. Decisions needed from the client

1. **Open-text answers to brands** — show all, admin-moderated, or a curated
   sample? (Privacy: free text is where people type names and numbers.)
2. **CSV only, or formatted .xlsx** (multi-tab, frozen headers)? CSV needs no
   library; .xlsx adds one. Their own plan recommends deciding before build.
3. **Minimum responses before a brand report can be published** (we suggest 5).
4. **Demographic suppression threshold** (we suggest <5).
5. **Which questions count as "awareness / perception / consideration"** for
   the Measurement headline — admin tags them with `measure_key`, but the
   client should name the standard set.
6. **Emailing the report** — the build plan deferred it because no email
   provider existed; Resend is now live, so "email the brand when the report
   is published" is a small add-on. In or out for this phase?
7. **Does the report differ by package** (Starter / Growth / Premium /
   Enterprise)? *Packages Details* lists Insights/Measurement items per tier,
   but the tier → benefit matrix is still undefined
   (`docs/new-model-implementation-plan.md`).

---

## 7. Suggested order and size

| Order | Slice | Size | Unblocks |
|---|---|---|---|
| 1 | A — admin results page | Medium | Sakshi's weekend report review has something to review |
| 2 | B — CSV exports | Small–Medium | Admin can build client reports by hand immediately |
| 3 | C — pre/post + demographics | Medium | Needs decision 5 |
| 4 | D — brand report + publish | Medium | Needs decisions 1, 3, 4 |

A + B need no client decision and can start now.

---

## 8. From the 7 Oct standup — status of every action

| Owner | Item | Status |
|---|---|---|
| Ketan | Survey display bigger, 10% cap buffer, custom refunds, more admin notifications, participants on campaign creation | Built in PR #11 (5 Oct) — **not yet deployed**; migrations 0054–0057 are in production |
| Ketan | Share the recording | Video is `docs/standup-2026-10-05/video/2026-10-05-briefing.webm` on the PR #11 branch |
| Ketan | Logo for event tickets | Design task — no code change yet |
| Sakshi | Virtual number / bank details on invoices | Bank details + WhatsApp fields exist (Payment settings, 0055); entering the real values is a settings task |
| Sakshi | Create order forms, review T&Cs | Order form follow-ups done on this branch (see below); T&Cs page content is theirs |
| Sakshi | Analyse reports over the weekend | This plan; Slice A gives an on-screen report to review. Findings → feedback widget or a doc |
| Sakshi | Landing page files to Drive | Non-code |
| Group | Friday joint testing | Checklist below |

### Order-form follow-ups done on this branch (from the Admin Portal brief review)

- Artist brief no longer exposes the Research participant count (0058).
- Total amount can be typed (all-in Enterprise price); fee and VAT are worked
  back from it, so fee + VAT = total still holds.
- Brand → campaign picker on the admin Campaigns page (the brief's
  "select brand, then campaign" order).
- Research and "Any other details" sections now say they're shown to the
  brand (not the artist), so internal notes don't end up on the brand's form.

### Friday testing checklist (from the standup)

- [ ] Admin creates order form → sends → brand receives in-app + email with link.
- [ ] Brand requests changes → admin sees note → edits → re-sends.
- [ ] Brand approves (both consents) → invoice sent automatically → admin notified.
- [ ] Artist sees the brief only after approval, only the four allowed sections.
- [ ] Partial refund (custom amount) → brand notified by email; WhatsApp details on the invoice.
- [ ] Email branding: logo renders, every link opens the right page on the live domain (`NEXT_PUBLIC_SITE_URL`).
- [ ] Survey cap: submit past expected + 10% → "survey closed" screen.
- [ ] Download PDF of the order form (browser "Save as PDF").
