# In-app feedback triage — 13 Oct 2026

Every report open in `feedback_reports` on 13 Oct, and what happened to it.
Screenshots couldn't be opened from the build environment (the storage host
is outside its network allowance), so triage is from the report text and the
code; reports where the picture might change the answer are marked.

## Fixed in this change

| Ref | Report | Cause | Fix |
|---|---|---|---|
| FB-00033 | Survey wouldn't submit: "We couldn't verify your browser" | **Turnstile keys are not set in the production deployment.** The survey attempt log shows every failure as `captcha_missing / unconfigured`, and production deliberately refuses submissions without the bot check, so *no* signed-in survey could be submitted. | Needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` in Vercel (settings change, see below). Code now reports this honestly ("temporarily unavailable on our side") and checks it before the rate limiter, so it isn't charged to the respondent. A genuine verification failure now says the answers are kept and to press Submit again. |
| FB-00034 | After a refresh: "Too many submission attempts" | The rate limiter counted every attempt-log row (2 per click, plus its own lockout rows). | Migration 0064: only real attempts count. |
| FB-00023 | Image upload stuck on "Uploading…" (5.45 MB image) | Vercel rejects request bodies over ~4.5 MB before the app runs; the builder awaited the upload with no error handling. | Large photos are resized in the browser before upload (≤ 2,400 px, WebP), and every survey upload now always ends in success or a readable error (`src/lib/image-upload.ts`). |
| FB-00024 | Next question's "Choose file" disabled while the previous upload hung | The "Uploading…" flag was shared by every question in the inspector. | Inspector state resets per question. |
| FB-00030 | Images didn't autofit above/below the question | Fixed 13 Oct (fixed-shape media boxes, fit option, recommended sizes). | — *(screenshot not checked)* |
| FB-00025 | Per-question body text colour had no effect | `color` was computed once on the survey wrapper, so a question's own colour variable never reached its text. | Each question card re-applies the colour; Likert and scale labels use it too. |
| FB-00027 | "Prompt is required" when saving a rating question that had a prompt | The error named a question *number*, but the builder never showed numbers, so it read as the question just edited. The empty prompt was on another question (e.g. one added by a stray palette click). | Cards are numbered (Q1, Q2…); a card with a problem says so in red; Save checks first and opens the offending question; the message names the type ("Question 4 (Single choice): Prompt is required"). |
| FB-00032 | Survey sign-up: no phone asked, page stuck, got a "Reset" email, not taken to the survey | After creating the account the action redirected to the same URL; the form stayed mounted with its old state, so it sat on "Creating your account…". | The form now goes straight to the first question. A mobile number is collected (with the one-number-per-audience check) and pre-fills onboarding later. The respondent is told the password link arrives titled "Reset your password" (that's the pre-confirmed-account design: no confirmation step to wait on). |
| FB-00004 | Admin can't edit event capacity, category, ticket price | Capacity and price were added in August; category wasn't. | Category added to the admin event edit form. |

## Already done before this change (verified in code)

| Ref | Report | Where |
|---|---|---|
| FB-00002 | "https" added to links | Web-address fields are plain text, normalised on save (`src/lib/urls.ts`, B4 spec). |
| FB-00003 | Phone uniqueness audience-only; split country code | 0023 + `PhoneInput`. |
| FB-00005 | Brand/artist can select participants | Selection is admin-only, enforced by the 0061 column guards. |
| FB-00006 | Audience can withdraw after selection | Withdraw only while not selected (`withdrawParticipation`). |
| FB-00007 | Admin messages: who said what; LES chat with a named person | Speaker names (0022) and admin threads by name (`NewAdminThread`). |
| FB-00008 | Message the brand from a campaign | "Message" links on admin campaign/request pages. |
| FB-00009 | Enquiries: which element it was about | `contact_messages.reference` shown on Enquiries. |
| FB-00026 | Background colour for the white survey area | Card colour + colour themes, 13 Oct. *(screenshot not checked — if they meant the page around the cards, that's a small addition.)* |

## Waiting on a decision

| Ref | Report | Status |
|---|---|---|
| FB-00028 | Rating question with several elements | **Fixed** — "Rating group" block in the survey builder (`docs/survey-feedback-2026-10-13-plan.md` §3). No database change. |
| FB-00029 | "Other — please specify" | **Fixed** — migration 0065; brands see the Other count only, admins see the typed text (same doc, §2). |
| FB-00031 | Live campaign statuses (Published / Completed / Closed reason) | Needs the client's call; see below. |

**FB-00031 proposal:** keep `in_progress` as the stored status but show a
derived **Live** badge (green) once it's paid, matched, codes confirmed and a
survey published — the same checklist brands now see. **Completed** stays a
manual admin action (after reporting), and **Closed** asks for a reason
(stored on the campaign, shown to the brand). Needs a small migration for the
close reason.

## Test submissions

FB-00001, FB-00010 – FB-00022 were raised by the automated specs and
verification runs — closed as "won't fix" with a note.
