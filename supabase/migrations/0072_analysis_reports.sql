-- =============================================================================
-- 0072 — AI survey analysis playground: saved reports (14 Oct standup).
--
-- Admins upload an anonymised survey CSV, pick the campaign for context, and
-- get a written report with charts. The figures are computed in the app
-- (src/lib/analysis/figures.ts); OpenAI writes the narrative from those
-- figures only. The raw CSV is NOT stored — only the figures, the narrative
-- and which columns were dropped as personal — so a report can be reopened
-- and re-exported without keeping respondent-level data around.
--
-- Admin-only both ways. A brand-facing read (their Reporting & Analysis
-- module) is a follow-up, once a report can be marked "shared".
-- =============================================================================

create table if not exists analysis_reports (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(title) <= 200),
  campaign_id      uuid references campaigns(id) on delete set null,
  source_filename  text check (source_filename is null or length(source_filename) <= 255),
  row_count        int not null default 0,
  dropped_columns  text[] not null default '{}',
  instructions     text check (instructions is null or length(instructions) <= 2000),
  figures          jsonb not null,
  narrative        jsonb,
  model            text,
  -- 'complete' = figures + narrative; 'figures_only' = OpenAI not set up or
  -- the call failed (error says why) — the figures are still useful.
  status           text not null default 'complete' check (status in ('complete', 'figures_only')),
  error            text,
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists analysis_reports_created_idx on analysis_reports (created_at desc);
create index if not exists analysis_reports_campaign_idx on analysis_reports (campaign_id);

alter table analysis_reports enable row level security;

drop policy if exists "analysis_reports: admin manage" on analysis_reports;
create policy "analysis_reports: admin manage"
  on analysis_reports for all
  using (is_admin()) with check (is_admin());
