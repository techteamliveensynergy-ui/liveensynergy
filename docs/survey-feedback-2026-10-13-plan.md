# Survey feedback — 13 Oct 2026

The client's notes on surveys, what this branch already does about each, and
the design for the three items that need database work and client decisions
first (logic/branching, "Other — please specify", multi-row rating).

## Triage

| # | Client note | Status | Where |
|---|---|---|---|
| 1 | Videos bigger on left & right; sizes for reel vs normal videos | **Done** | Side video column is now 3/5 of the card (landscape) and edge-to-edge; a reel is a 9:16 player capped at 70% of the screen height. `QuestionMedia.tsx` |
| 2 | Option to choose reel or normal video | **Done** | "Video shape" per question and for the cover video: detect from link (YouTube Shorts / Instagram Reel / TikTok = reel) or pick explicitly. Instagram Reel and TikTok links now embed too. Unembeddable links show a warning in the builder instead of silently rendering nothing. |
| 3 | Question text bigger + a few font sizes to choose | **Done** | New default prompt size is much larger; Small / Medium / Large / Extra large per survey (`question_font_size`, 0062) and per question (`config.question_size`). Still multiplied by the existing "Text size". |
| 4 | Images/videos cover the border areas; corner radius slightly less | **Done** | Question cards have no padding around media any more — it runs to the card edges; only the text column is padded. Card corners 1.25rem → 1rem; option image tiles rounded-xl → rounded-lg. |
| 5 | PPT-size cards for welcome and thank-you | **Done** | Welcome gate and thank-you screens are 16:9 slides from tablet width up, media filling the left half. On a phone they're normal stacked cards (a 16:9 box would be ~200px tall). They grow rather than clip when the text is long. `SurveySlide.tsx` |
| 6 | If autofit doesn't work, tell us specific image sizes | **Done** | Each placement now renders in a fixed-shape box, and the builder shows the size for it: above/below 1600×800 (2:1), left/right 1080×1350 (4:5), background 1920×1080, welcome cover 1600×900, option tiles 800×800, logo 400×400. Plus an "Image fit" choice: fill (may crop) or show the whole image. `RECOMMENDED_IMAGE_SIZES` |
| 7 | Distance between question and answer options | **Done** | `.survey-answer` gap below the prompt/help text. |
| 8 | Question font bigger / size options | **Done** | Same as #3. |
| 9 | Help text below the question, not below the options | **Done** | Order is now prompt → help → options. |
| 10 | More opacity for background images | **Done** | "Background image visibility" slider (0–100%, default 30%; it was a fixed ≈14%). Applies to the single-page background and to each step's background. |
| 11 | Upload a theme / change the survey card colour | **Done (themes as presets)** | Card colour per survey and per question; six one-click colour themes (Classic, Sunset, Forest, Lavender, Ocean, Midnight) that fill the existing colour fields. Option rows and borders derive from the text colour, so dark cards stay readable. Uploading a theme *file* isn't proposed — see open question Q6. |
| 12 | Typeform video for visual aesthetics | **Partly** | The video couldn't be opened from the build environment. Applied Typeform's well-known conventions: large prompts, lettered option rows (A/B/C) with a tick, split image/text layouts, slide-style welcome/thank-you. Q7 asks for the specific moments they liked. |
| 13 | Logic and branching | **Planned** — §1 | Needs a database change (server-side validation must know which questions were skipped) and client decisions. |
| 14 | "Other — please specify" in single/multi choice | **Done** (FB-00029) — §2 | Migration 0065. Single choice, multiple choice, dropdown and image tiles. |
| 15 | Rating question with several rated elements | **Done** (FB-00028) — §3 | "Rating group" in the builder palette; no database change. |
| 16 | "Issues with form of surveys" | **Need details** | Too vague to act on. One real bug found and fixed while in here (below). Q8. |

### Bug fixed along the way

On the signed-in dashboard survey (single-page layout with the welcome gate
on), the per-question "shown at" timer was attached before the questions were
on screen, so every answer was stored with `shown_at = null`. That starves the
quality engine's completion-time signal. The public survey page didn't have
the bug. `SurveyForm.tsx` now waits for the gate to clear.

### Also changed

- All four respondent renderers (public, signed-in, admin preview, stepped)
  now draw a question through one `SurveyQuestionCard`, so a visual change
  lands everywhere at once. They used to have four copies of the card markup.
- The "Button colour" now also colours the progress bar and selected answers.
  A custom colour no longer sits next to orange selections.

### Rollout

1. Apply `0062_survey_presentation.sql` **before** deploying. Pages still read
   a template without the new columns (defaults apply), but saving survey
   details writes them and would fail.
2. Every existing survey picks up: bigger prompts, help text above options,
   lettered option rows, edge-to-edge media, slide welcome/thank-you, and
   background images at 30% instead of ≈14%. That's what the client asked for,
   but it's a visible change to live surveys. Mention it before deploying.
3. Re-run the survey walkthroughs (`survey-admin-layout-branding.spec.ts`,
   `public-survey-walkthrough.spec.ts`, `full-survey-walkthrough.spec.ts`).
   Selectors that clicked a bare radio by label still work (the input is
   inside the label), but screenshots will differ.

---

## 1. Logic and branching

### Recommended model: "show this question if …" (display conditions)

Each question can carry conditions on **earlier** questions' answers. It's
shown only when they hold. Typeform-style "jump to" is the same thing seen
from the other side ("after Q3, if X go to Q7" = Q4–Q6 show only if not X).
Display conditions:

- work in both layouts (single-page hides/reveals cards live; stepped skips
  steps),
- can't form loops, because a condition may only reference questions above it,
- are one rule per question, which makes them easy to show in the builder
  ("Shown if Q2 is *Yes*").

```ts
// survey_questions.config.show_if
{
  match: "all" | "any",
  rules: [
    { question_id: uuid, op: "is" | "is_not" | "includes" | "excludes"
                         | "answered" | "not_answered" | "gte" | "lte", value?: string | number }
  ]
}
```

### What has to change, and why

| Layer | Change |
|---|---|
| Respondent UI | `isQuestionVisible(q, answers)` in `src/lib/surveys.ts`. Hidden questions are skipped by the stepped layout and collapsed in single-page. **When a question becomes hidden, its answer is cleared**, so a stale answer from an abandoned path is never submitted. The progress bar counts visible questions only. |
| Client validation | `validateAnswers()` skips hidden questions (no "needs an answer") and rejects answers to them. |
| **Database** (migration) | `validate_survey_answer_types()` is the authoritative validator and currently errors on any unanswered required question. It needs a plpgsql twin of `isQuestionVisible`, kept in step the same way `SCALE_NA_VALUE` is. Without that, every branched survey would fail to submit. |
| Builder | A "Logic" section in the inspector: "Show this question when [earlier question] [is] [option]". A "Conditional" badge on the canvas card. Save-time checks: rule references an earlier question; option still exists. Reordering or deleting a referenced question warns and drops or blocks the rule. |
| Results | A conditional question's percentages must use **the people who were shown it**, not all responses. Otherwise "40% answered" just means "60% weren't asked". Proposal: the submit function records skipped-by-logic questions, and the results card reads "asked to 120 of 300". |
| Quality engine | Skip hidden questions in question coverage, straight-lining, attention checks (a hidden check isn't a fail) and contradiction rules. Completion time is compared against the median of responses that saw a similar number of questions. A short path shouldn't look like speeding. |
| Exports | Hidden questions export as blank with a "not asked" marker, distinct from "asked, skipped". |

### Edge cases to cover

- Condition on a multiple-choice question ("includes"), a scale ("≥ 4"), and
  on a question that is itself conditional (chains). A rule on a hidden
  question evaluates as "not answered".
- Required + hidden → never blocks. Optional + shown + blank → fine.
- An admin edits options after responses exist → rules referencing a removed
  option are flagged in the builder, never silently true/false.
- Every path through the survey ends at Submit. "End survey early /
  disqualify" is a separate ending feature: see Q2.
- Single-page: revealing a question mid-scroll shouldn't jump the page;
  `shown_at` starts when it's revealed, not at page load.

**Estimate:** 3–4 days including the migration, the builder UI and walkthrough updates.

## 2. "Other — please specify" — built (FB-00029, migration 0065)

As designed below, with these specifics:

- Applies to single choice, multiple choice and dropdown (not Likert, whose
  options are a fixed agreement scale). The builder toggle sits under the
  options list, with a label field.
- The server *ignores* `other_text` sent without Other chosen (stores null)
  rather than rejecting the submission — a stale draft can't fail a respondent.
- Brand visibility follows the recommended default: **count only**. The typed
  text is shown to admins on the results page (latest 10, rejected responses
  excluded) and in the CSV export as "Other: …" in the question's own column.
- Not done yet: the typed text does not feed the open-text-quality signal in
  `score_survey_response()` (needs another migration; low value until surveys
  use Other heavily).

Original design:

- Builder: a toggle on single choice, multiple choice and dropdown, "Add an
  'Other' option", with an editable label (default "Other").
- Respondent: an extra "Other" row. Picking it reveals a text box underneath,
  which is required while Other is selected. Unticking Other clears the text.
  Image-tile questions get an "Other" tile.
- Storage: the answer value keeps its shape and uses a reserved value
  `__other__` (the same trick as scale N/A). The typed text goes in a new
  `survey_answers.other_text` column (additive migration). A combined shape
  like `{choice, text}` was rejected: it would break every stats, export and
  scoring branch that expects a string or a string array.
- Database: `validate_survey_answer_types()` accepts `__other__` only when the
  question enables it, requires non-empty `other_text` (≤ 200 chars) with it,
  and rejects `other_text` without it. `submit_survey_response()` writes the
  column. Min/max selections count Other as one choice.
- Results: "Other" gets its own bar (its counts already work, as it's just an
  option value). The admin sees the typed answers in a list, like long-text
  answers, and in the export as a "Q5 — other" column. **The brand sees the
  Other bar but not the typed text**, the same rule as open-text answers
  today, because free text can contain names or phone numbers.
- Quality: the typed text joins the open-text-quality signal. "Other" is not
  treated as an opt-out.

**Estimate:** 1–1.5 days including the migration.

## 3. Rating question with several elements (matrix) — built (FB-00028)

Built as the recommended rating group. Builder: "Rating group" in the palette
adds three rows (1–5, Poor → Excellent) under one group question; "+ Add
another item" adds a row; editing the scale, labels, size, colours, media or
help text on any row copies it to the whole group. Respondent: one card with
the group question as heading and one compact scale per row (one step in
stepped layout; Next names the first unanswered required row). Results and
export title each row "Group question — Item". Rows are kept together only
while adjacent — dragging a row away from its group shows it as its own small group card (same group question) where it lands.

Original design:

E.g. "Rate the following: Sound · Lighting · Bar · Staff" on one 1–5 scale.

**Recommended: a "rating group"** of ordinary scale questions that share
`config.group_id` and render together in one card (one step in stepped
layout). The builder adds it as one block. The admin edits the shared scale
once, and each element is a row.

- No database change: each row *is* a scale question, so validation, stats,
  results bars, exports, contradiction rules and the straight-lining signal
  all work as they are. Straight-lining is exactly the risk a matrix brings.
- Phones: rows stack as compact scales instead of a wide grid that would
  scroll sideways.
- Cost: the survey's question count includes each row, and error messages
  name the row's own prompt.

Alternative: a new `matrix_rating` question type with a `{row: score}`
answer. That's cleaner in the data, but it needs the type constraint widened,
new validator, stats, export and scoring branches, and a new results card:
about 3 days against about 1.

## Open questions for the client

1. **Branching:** is "show this question only if …" enough, or do they need
   explicit "jump to question X" rules as the authoring UI? The data can be
   the same either way.
2. **Branching:** do they want early endings ("Sorry, this survey isn't for
   you" for screen-outs)? Should a screened-out respondent count toward the
   response cap or rewards?
3. **Other:** may the brand see the typed "Other" answers, or only the count?
   Shipped as count only; showing the text to brands is a small change if
   they want it.
4. **Matrix:** grouped scale questions (recommended), or a true matrix type?
   Do rows need different scales from each other?
5. **Defaults:** happy for live surveys to switch to the new look (bigger
   questions, 30% background visibility) on deploy, or should existing
   surveys keep the old look until re-saved?
6. **Themes:** are the six colour presets enough, or do they want to save
   their own named themes for reuse across surveys? That's possible, and
   different from uploading a file.
7. **Typeform video:** which moments did they like (transitions, keyboard
   shortcuts, full-screen layout)? These weren't visible from here.
8. **"Issues with form of surveys":** which screen, which device, and what
   went wrong? Screenshots would help.
