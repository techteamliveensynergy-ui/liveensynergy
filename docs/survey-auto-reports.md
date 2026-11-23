# Automatic survey reports — the Campaign Performance Report

When a survey closes, a **Campaign Performance Report** is generated
automatically and lands with the admins as a **draft to review**. Nothing
reaches the brand until an admin publishes it (the existing *Publish to
brand* button, 0115). Migration `0127_survey_auto_reports.sql`; code in
`src/lib/survey-reports/`.

## One format

The package brief's *Measurement* and *Insights*, always in this order
(`src/lib/analysis/campaign-report.ts`):

| # | Section | Filled by |
|---|---|---|
| 1 | Cover — brand, campaign, event + date, venue, survey, response window | code |
| 2 | Headline and summary | AI |
| 3 | **Measurement** — registered, completed surveys (vs the package target), completion rate, verified attendance, codes issued, redemption rate, cost per completed survey, cost per participant | code |
| 3b | **Before and after the event** (post-event survey) — questions worded identically in the pre- and post-event surveys, side by side | code |
| 4 | Audience profile — age band, gender, country (brand copy: groups under 5 show "<5") | AI + code charts |
| 5 | Brand impact — awareness, recognition, perception, consideration, purchase intent | AI |
| 6 | Event experience and attitudes | AI |
| 7 | Open-ended responses — themes and anonymous quotes | AI |
| 8 | Key findings, recommendations | AI |
| 9 | About the data — what was left out and why, sample size | code + AI |

A section the survey asked nothing about reads **"Not measured in this
survey."** The AI may only quote figures the code worked out and quotes from
the sampled written answers; charts can only point at computed figures.

## Inputs

Each report keeps the two files it was made from (admin-only, downloadable
from the report page, deleted with the report — `analysis_report_inputs`):

- **responses.csv** — the same anonymised one-row-per-respondent file as the
  admin download (no names, emails, phones or dates of birth; contact details
  in open text masked; hidden questions left out), **passed responses only**.
- **context.json** — survey (questions, response counts), campaign
  (objectives, expected outcomes, package, target), brand, event (date, venue,
  category, capacity, audience) and the measurement figures. Never the
  platform's margin.

The AI receives the per-question figures computed from the CSV, a sample of
written answers, the comparison and the context — never respondent rows.

## When a survey closes

| Survey | Closes when |
|---|---|
| Pre-event | the event's day has ended (event time zone), or the event is marked completed |
| Post-event | the campaign is completed or closed |
| Either | the survey is archived; the campaign is closed/completed; the event is cancelled with no replacement |

- **Responses held for review** (pending/review) when it closes: the report
  waits until they're decided, or 48 hours, whichever comes first, then uses
  passed responses only and says how many were left out.
- **0 passed responses**: no report; admins are told.
- **1–4 passed**: figures only, no AI write-up; can't be published (brands see
  reports from 5 responses).
- **AI not set up / fails**: the figures are saved straight away; a failure is
  retried hourly (3 attempts), then admins are told.
- **Campaign reopened and closed again**: a new version (v2…); the old one,
  published or not, is kept.
- **Surveys already closed when 0127 was applied** get no report
  automatically. Use **Generate report now** on the survey's results page —
  it also works for a survey that's still open, or to re-run one.

## Setup (once per environment)

1. Apply `0127_survey_auto_reports.sql` (after 0126).
2. `OPENAI_API_KEY` must be set in Vercel for the write-up (already used by the
   analysis playground). Without it the reports are figures only.
3. Schedule the worker every 15 minutes with Supabase `pg_cron` (Vercel Hobby
   has no sub-daily cron), the same way as the email outbox
   (`docs/email-setup.md` — the `cron_secret` Vault secret is already there):

   ```sql
   select cron.schedule('survey-reports', '*/15 * * * *', $$
     select net.http_get(
       url     := 'https://<production-origin>/api/cron/survey-reports',
       headers := jsonb_build_object(
         'Authorization',
         'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                        where name = 'cron_secret')),
       timeout_milliseconds := 300000
     );
   $$);
   ```

   Closing/completing a campaign, archiving a survey and "Generate report now"
   also start the worker straight away; the schedule is what catches the
   time-based closes (the event day ending) and the 48 h waits.

## Checking it

- Admin → **Surveys → (a survey) → Results** → *Campaign Performance Report*
  shows the job (queued / waiting for held responses / being generated) and
  the reports, with **Generate report now**.
- Admin → **Reporting & analysis → Analysis playground** lists them with
  *Automatic* and *Draft — needs review* tags.
- `select status, outcome, close_reason, attempts, last_error from survey_report_jobs order by created_at desc;`
- Every generation is in `admin_audit_log` (`survey_report.generate`), as is
  every input download (`survey_report.inputs_download`).
