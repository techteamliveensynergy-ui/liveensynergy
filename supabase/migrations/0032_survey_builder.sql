-- =============================================================================
-- Live-En-Synergy — survey builder (Phase 3, part 1)
--
-- docs/survey-form-builder-design.md §2/§3: the admin drag-and-drop survey
-- builder. Scoped deliberately narrow — only what the builder itself needs to
-- author and persist a draft/published question set. `survey_responses` /
-- `survey_answers` are NOT part of this migration: nothing here reads or
-- writes them, and their design (anonymised brand-facing view, quality-engine
-- scoring) belongs with the participant-renderer phase that follows this one.
-- Confirmed net-new: a repo-wide search for "survey" across src/ and
-- supabase/migrations/ returned zero hits before this file.
--
-- `text` + `check` rather than a Postgres enum for `kind`/`status`/`type`,
-- matching `campaign_packages`/`invoices`' later tables rather than the
-- original `sponsorship_status` enum — see 0020's note on why adding a value
-- to an enum can't be used in the same transaction that adds it. A question
-- type list this provisional (design doc §1 calls it out as such) shouldn't
-- inherit that friction.
-- =============================================================================

create table survey_templates (
  id           uuid primary key default gen_random_uuid(),
  -- Nullable + on delete set null (matching invoices.campaign_id): the
  -- builder can author a template before the campaign-linkage flow exists,
  -- and a campaign being removed shouldn't cascade-delete a survey.
  campaign_id  uuid references campaigns (id) on delete set null,
  kind         text not null default 'pre_event' check (kind in ('pre_event', 'post_event')),
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  title        text not null,
  description  text,
  created_by   uuid references profiles (id) on delete set null,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint survey_templates_published_needs_campaign
    check (status <> 'published' or campaign_id is not null)
);
create index on survey_templates (campaign_id);
create index on survey_templates (status);
create trigger survey_templates_set_updated_at before update on survey_templates
  for each row execute function set_updated_at();

-- One live pre-event and one live post-event survey per campaign at a time.
create unique index survey_templates_one_published_per_campaign_kind
  on survey_templates (campaign_id, kind) where status = 'published';

create table survey_questions (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references survey_templates (id) on delete cascade,
  order_index integer not null,
  type        text not null check (type in (
    'single_choice', 'multiple_choice', 'scale', 'yes_no', 'dropdown',
    'short_text', 'long_text', 'ranking', 'number', 'attention_check', 'hidden_field'
  )),
  -- Null for hidden_field — it never renders, so has no prompt copy.
  prompt      text,
  help_text   text,
  options     jsonb,                          -- [{ "label": "...", "value": "..." }, ...]
  config      jsonb not null default '{}'::jsonb,  -- min/max/step/expected_answer/profile_field per type
  required    boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (template_id, order_index)
);
create index on survey_questions (template_id);

alter table survey_templates enable row level security;
alter table survey_questions enable row level security;

-- Admin-only both ways in this slice. The participant-facing read policy on
-- `published` templates (and the brand-facing anonymised response view) lands
-- additively with the renderer phase, once there's anything to read.
create policy "survey_templates: admin manage"
  on survey_templates for all using (is_admin()) with check (is_admin());

create policy "survey_questions: admin manage"
  on survey_questions for all using (is_admin()) with check (is_admin());

-- No notification_events rows in this migration on purpose: nothing about
-- drafting or publishing a survey template notifies anyone today. The
-- `survey.*` keys (completion, quality-review-needed, ...) arrive with the
-- renderer/quality-engine phase, where there's an actual recipient and event.
