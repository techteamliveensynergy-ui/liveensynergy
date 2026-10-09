-- =============================================================================
-- Live-En-Synergy — survey results: running stats + anonymised export
-- (docs/survey-results-analysis-plan.md, slices A + B).
--
-- The results page must not re-read every answer on every view: a survey with
-- a few thousand responses × 20 questions is ~100k answer rows. Instead each
-- submission updates small per-survey and per-question counters in the same
-- transaction that writes it, and the page reads those (a handful of rows,
-- whatever the response count).
--
-- What "counts": every response that is NOT rejected (pending, pass, review).
-- A response's answers are added when it arrives and taken back out if it is
-- later rejected (and added back if a reject is overturned), so the numbers
-- are live while the survey is open and settle as the review queue is worked.
--
--   survey_template_stats  one row per survey: status counts, completion time
--   survey_question_stats  one row per question: answered, time on question,
--                          option counts, numeric sums, ranking position sums
--   survey_daily_stats     responses per day (Europe/London), for the trend
--
-- Concurrency: every submission already takes a row lock on its template
-- (survey_responses_enforce_cap, 0056), so the counter upserts for one survey
-- are serialised and can't lose an increment.
--
-- Safety net: rebuild_survey_stats(template) recomputes a survey from its raw
-- rows with the same functions, for an admin "Recalculate" button.
--
-- Anonymised export: survey_responses gains a stable respondent number
-- (RSP-00001). survey_export_rows() hands admins a page of responses with no
-- name / email / phone / date of birth — a respondent ID, a per-person
-- pseudonym (so one person's pre and post answers can be linked), timings,
-- coarse demographics (age band, gender, country) and the answers.
--
-- All additive. Backfills the respondent numbers and the stats for every
-- existing survey at the end.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Respondent number / reference (RSP-00001), in submission order.
-- -----------------------------------------------------------------------------
create sequence if not exists survey_respondent_no_seq;

-- One block (one transaction) holding a lock that blocks new submissions, so
-- no response can land between numbering the existing rows and the column
-- getting its default — that row would be left null and `set not null` fail.
do $$
declare
  v_offset bigint;
begin
  lock table survey_responses in share row exclusive mode;

  alter table survey_responses add column if not exists respondent_no bigint;

  select coalesce(max(respondent_no), 0) into v_offset from survey_responses;
  update survey_responses r
     set respondent_no = v_offset + o.rn
    from (
      select id, row_number() over (order by submitted_at, id) as rn
        from survey_responses
       where respondent_no is null
    ) o
   where r.id = o.id;
  perform setval(
    'survey_respondent_no_seq',
    greatest((select coalesce(max(respondent_no), 0) from survey_responses), 1),
    (select max(respondent_no) is not null from survey_responses)
  );

  alter table survey_responses alter column respondent_no set default nextval('survey_respondent_no_seq');
  alter table survey_responses alter column respondent_no set not null;
end $$;

alter sequence survey_respondent_no_seq owned by survey_responses.respondent_no;
create unique index if not exists survey_responses_respondent_no_key on survey_responses (respondent_no);

-- lpad truncates past its width, so only pad below 100000.
alter table survey_responses add column if not exists reference text
  generated always as (
    'RSP-' || case when respondent_no < 100000 then lpad(respondent_no::text, 5, '0') else respondent_no::text end
  ) stored;

-- -----------------------------------------------------------------------------
-- 2. Stats tables. Admin read only; written only by the definer functions below.
-- -----------------------------------------------------------------------------
create table if not exists survey_template_stats (
  template_id          uuid primary key references survey_templates (id) on delete cascade,
  responses_total      int not null default 0,  -- every response, rejected included
  pending_count        int not null default 0,
  pass_count           int not null default 0,
  review_count         int not null default 0,
  reject_count         int not null default 0,
  -- Completion time of counted (non-rejected) responses. Each one is capped at
  -- 2 hours in the sum so one tab left open overnight can't drag the average;
  -- the bucket uses the real time.
  duration_count       int not null default 0,
  duration_sum_seconds numeric not null default 0,
  duration_buckets     jsonb not null default '{}'::jsonb,
  last_response_at     timestamptz,
  updated_at           timestamptz not null default now()
);

create table if not exists survey_question_stats (
  question_id    uuid primary key references survey_questions (id) on delete cascade,
  template_id    uuid not null references survey_templates (id) on delete cascade,
  answered_count int not null default 0,          -- counted responses that answered it
  -- Time from the question being shown to it being answered (client-reported,
  -- so each one is capped at 10 minutes in the sum).
  time_count     int not null default 0,
  time_sum_ms    bigint not null default 0,
  -- scale (excluding "not applicable") and number answers
  num_count      int not null default 0,
  num_sum        numeric not null default 0,
  num_sumsq      numeric not null default 0,
  na_count       int not null default 0,          -- scale "not applicable"
  option_counts  jsonb not null default '{}'::jsonb, -- answer value -> count
  rank_sums      jsonb not null default '{}'::jsonb, -- ranking item -> sum of positions (1 = top)
  updated_at     timestamptz not null default now()
);
create index if not exists survey_question_stats_template_idx on survey_question_stats (template_id);

create table if not exists survey_daily_stats (
  template_id uuid not null references survey_templates (id) on delete cascade,
  day         date not null,
  responses   int not null default 0,
  primary key (template_id, day)
);

alter table survey_template_stats enable row level security;
alter table survey_question_stats enable row level security;
alter table survey_daily_stats enable row level security;

drop policy if exists "survey_template_stats: admin read" on survey_template_stats;
create policy "survey_template_stats: admin read" on survey_template_stats for select using (is_admin());
drop policy if exists "survey_question_stats: admin read" on survey_question_stats;
create policy "survey_question_stats: admin read" on survey_question_stats for select using (is_admin());
drop policy if exists "survey_daily_stats: admin read" on survey_daily_stats;
create policy "survey_daily_stats: admin read" on survey_daily_stats for select using (is_admin());

-- -----------------------------------------------------------------------------
-- 3. Counter helpers.
-- -----------------------------------------------------------------------------

-- {"a": 2, "b": 1} + {"a": -1, "c": 1} = {"a": 1, "b": 1, "c": 1}; zeros dropped.
create or replace function survey_stats_add_counts(a jsonb, b jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    from (
      select key as k, sum(value::numeric) as v
        from (
          select * from jsonb_each_text(coalesce(a, '{}'::jsonb))
          union all
          select * from jsonb_each_text(coalesce(b, '{}'::jsonb))
        ) e
       group by key
    ) s
   where v <> 0;
$$;

-- Adds (p_sign = 1) or removes (p_sign = -1) one answer's contribution.
create or replace function survey_stats_apply_answer(
  p_question_id uuid, p_value jsonb, p_shown timestamptz, p_answered timestamptz, p_sign int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_q        record;
  v_kind     text := jsonb_typeof(p_value);
  v_text     text := p_value #>> '{}';
  v_counts   jsonb := '{}'::jsonb;
  v_ranks    jsonb := '{}'::jsonb;
  v_num      numeric;
  v_na       int := 0;
  v_tcount   int := 0;
  v_ms       bigint := 0;
begin
  select id, template_id, type into v_q from survey_questions where id = p_question_id;
  -- Hidden fields carry identity (name, email, phone…) — never in results.
  if not found or v_q.type = 'hidden_field' then
    return;
  end if;
  -- A skipped optional question is stored as an empty value: not an answer.
  if p_value is null or v_kind = 'null'
     or (v_kind = 'string' and btrim(v_text) = '')
     or (v_kind = 'array' and jsonb_array_length(p_value) = 0) then
    return;
  end if;

  if v_q.type in ('single_choice', 'dropdown', 'yes_no', 'attention_check') and v_kind in ('string', 'number', 'boolean') then
    v_counts := jsonb_build_object(v_text, p_sign);

  elsif v_q.type = 'multiple_choice' and v_kind = 'array' then
    select coalesce(jsonb_object_agg(x, p_sign), '{}'::jsonb) into v_counts
      from (select distinct jsonb_array_elements_text(p_value) as x) d;

  elsif v_q.type = 'ranking' and v_kind = 'array' then
    select coalesce(jsonb_object_agg(x, p_sign), '{}'::jsonb),
           coalesce(jsonb_object_agg(x, p_sign * pos), '{}'::jsonb)
      into v_counts, v_ranks
      from (
        select x, min(pos) as pos
          from jsonb_array_elements_text(p_value) with ordinality as t(x, pos)
         group by x
      ) d;

  elsif v_q.type in ('scale', 'number') then
    if v_q.type = 'scale' and v_text = '__na__' then
      v_na := p_sign;
    elsif v_kind = 'number' or (v_kind = 'string' and v_text ~ '^\s*-?\d+(\.\d+)?\s*$') then
      v_num := btrim(v_text)::numeric;
      if v_q.type = 'scale' then
        v_counts := jsonb_build_object(trim_scale(v_num)::text, p_sign);
      end if;
    end if;
  end if;
  -- short_text / long_text: counted as answered only; read via survey_text_answers().

  if p_shown is not null and p_answered is not null and p_answered >= p_shown then
    v_tcount := p_sign;
    v_ms := p_sign * least(extract(epoch from (p_answered - p_shown)) * 1000, 600000)::bigint;
  end if;

  insert into survey_question_stats as s (
    question_id, template_id, answered_count, time_count, time_sum_ms,
    num_count, num_sum, num_sumsq, na_count, option_counts, rank_sums, updated_at
  ) values (
    v_q.id, v_q.template_id, p_sign, v_tcount, v_ms,
    case when v_num is null then 0 else p_sign end,
    coalesce(p_sign * v_num, 0),
    coalesce(p_sign * v_num * v_num, 0),
    v_na, v_counts, v_ranks, now()
  )
  on conflict (question_id) do update set
    answered_count = s.answered_count + excluded.answered_count,
    time_count     = s.time_count + excluded.time_count,
    time_sum_ms    = s.time_sum_ms + excluded.time_sum_ms,
    num_count      = s.num_count + excluded.num_count,
    num_sum        = s.num_sum + excluded.num_sum,
    num_sumsq      = s.num_sumsq + excluded.num_sumsq,
    na_count       = s.na_count + excluded.na_count,
    option_counts  = survey_stats_add_counts(s.option_counts, excluded.option_counts),
    rank_sums      = survey_stats_add_counts(s.rank_sums, excluded.rank_sums),
    updated_at     = now();
end;
$$;

-- Status counters (every response, rejected included).
create or replace function survey_stats_status_delta(
  p_template_id uuid, p_status text, p_sign int, p_total int, p_last timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into survey_template_stats as s (
    template_id, responses_total, pending_count, pass_count, review_count, reject_count, last_response_at, updated_at
  ) values (
    p_template_id, p_total,
    case when p_status = 'pending' then p_sign else 0 end,
    case when p_status = 'pass'    then p_sign else 0 end,
    case when p_status = 'review'  then p_sign else 0 end,
    case when p_status = 'reject'  then p_sign else 0 end,
    p_last, now()
  )
  on conflict (template_id) do update set
    responses_total  = s.responses_total + excluded.responses_total,
    pending_count    = s.pending_count + excluded.pending_count,
    pass_count       = s.pass_count + excluded.pass_count,
    review_count     = s.review_count + excluded.review_count,
    reject_count     = s.reject_count + excluded.reject_count,
    last_response_at = greatest(s.last_response_at, excluded.last_response_at),
    updated_at       = now();
end;
$$;

-- A counted response's completion time and its day in the trend.
create or replace function survey_stats_apply_response(
  p_template_id uuid, p_started timestamptz, p_submitted timestamptz, p_sign int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secs   numeric := extract(epoch from (p_submitted - p_started));
  v_bucket text;
begin
  if v_secs is not null and v_secs >= 0 then
    v_bucket := case
      when v_secs < 60   then 'lt1m'
      when v_secs < 180  then '1to3m'
      when v_secs < 300  then '3to5m'
      when v_secs < 600  then '5to10m'
      when v_secs < 1200 then '10to20m'
      else '20m_plus'
    end;
    insert into survey_template_stats as s (template_id, duration_count, duration_sum_seconds, duration_buckets, updated_at)
    values (p_template_id, p_sign, p_sign * least(v_secs, 7200), jsonb_build_object(v_bucket, p_sign), now())
    on conflict (template_id) do update set
      duration_count       = s.duration_count + excluded.duration_count,
      duration_sum_seconds = s.duration_sum_seconds + excluded.duration_sum_seconds,
      duration_buckets     = survey_stats_add_counts(s.duration_buckets, excluded.duration_buckets),
      updated_at           = now();
  end if;

  insert into survey_daily_stats as d (template_id, day, responses)
  values (p_template_id, (p_submitted at time zone 'Europe/London')::date, p_sign)
  on conflict (template_id, day) do update set responses = d.responses + excluded.responses;
end;
$$;

create or replace function survey_stats_apply_response_answers(p_response_id uuid, p_sign int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform survey_stats_apply_answer(a.question_id, a.value, a.shown_at, a.answered_at, p_sign)
     from survey_answers a
    where a.response_id = p_response_id;
end;
$$;

-- None of the helpers is for clients: calling them through the API could
-- poison the numbers. Triggers run them as the function owner regardless.
revoke all on function survey_stats_apply_answer(uuid, jsonb, timestamptz, timestamptz, int) from public, anon, authenticated;
revoke all on function survey_stats_status_delta(uuid, text, int, int, timestamptz) from public, anon, authenticated;
revoke all on function survey_stats_apply_response(uuid, timestamptz, timestamptz, int) from public, anon, authenticated;
revoke all on function survey_stats_apply_response_answers(uuid, int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Triggers.
--
-- Submission order (0037/0043): response INSERT (pending) -> answer INSERTs
-- -> score_survey_response() UPDATEs quality_status. Answers count while the
-- response isn't rejected; a later reject takes them back out. Responses are
-- only deleted by a participation's cascade; BEFORE DELETE still sees the
-- answers, so it can subtract them. Answers are never updated in place.
-- -----------------------------------------------------------------------------
create or replace function survey_responses_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform survey_stats_status_delta(new.template_id, new.quality_status, 1, 1, new.submitted_at);
    if new.quality_status <> 'reject' then
      perform survey_stats_apply_response(new.template_id, new.started_at, new.submitted_at, 1);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.quality_status is distinct from old.quality_status then
      perform survey_stats_status_delta(old.template_id, old.quality_status, -1, 0, null);
      perform survey_stats_status_delta(new.template_id, new.quality_status, 1, 0, null);
      if old.quality_status <> 'reject' and new.quality_status = 'reject' then
        perform survey_stats_apply_response(old.template_id, old.started_at, old.submitted_at, -1);
        perform survey_stats_apply_response_answers(old.id, -1);
      elsif old.quality_status = 'reject' and new.quality_status <> 'reject' then
        perform survey_stats_apply_response(new.template_id, new.started_at, new.submitted_at, 1);
        perform survey_stats_apply_response_answers(new.id, 1);
      end if;
    end if;
    return new;
  else
    perform survey_stats_status_delta(old.template_id, old.quality_status, -1, -1, null);
    if old.quality_status <> 'reject' then
      perform survey_stats_apply_response(old.template_id, old.started_at, old.submitted_at, -1);
      perform survey_stats_apply_response_answers(old.id, -1);
    end if;
    return old;
  end if;
end;
$$;

create or replace function survey_answers_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from survey_responses r where r.id = new.response_id and r.quality_status <> 'reject'
  ) then
    perform survey_stats_apply_answer(new.question_id, new.value, new.shown_at, new.answered_at, 1);
  end if;
  return new;
end;
$$;

drop trigger if exists survey_responses_stats_ins on survey_responses;
create trigger survey_responses_stats_ins after insert on survey_responses
  for each row execute function survey_responses_stats_trigger();
drop trigger if exists survey_responses_stats_upd on survey_responses;
create trigger survey_responses_stats_upd after update of quality_status on survey_responses
  for each row execute function survey_responses_stats_trigger();
drop trigger if exists survey_responses_stats_del on survey_responses;
create trigger survey_responses_stats_del before delete on survey_responses
  for each row execute function survey_responses_stats_trigger();
drop trigger if exists survey_answers_stats_ins on survey_answers;
create trigger survey_answers_stats_ins after insert on survey_answers
  for each row execute function survey_answers_stats_trigger();

-- -----------------------------------------------------------------------------
-- 5. Rebuild (safety net) — same functions, from the raw rows.
-- -----------------------------------------------------------------------------
create or replace function survey_stats_rebuild_internal(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Same lock a submission takes (0056), so none lands mid-rebuild.
  perform 1 from survey_templates where id = p_template_id for update;
  delete from survey_question_stats where template_id = p_template_id;
  delete from survey_template_stats where template_id = p_template_id;
  delete from survey_daily_stats where template_id = p_template_id;
  for r in select * from survey_responses where template_id = p_template_id loop
    perform survey_stats_status_delta(r.template_id, r.quality_status, 1, 1, r.submitted_at);
    if r.quality_status <> 'reject' then
      perform survey_stats_apply_response(r.template_id, r.started_at, r.submitted_at, 1);
      perform survey_stats_apply_response_answers(r.id, 1);
    end if;
  end loop;
end;
$$;
revoke all on function survey_stats_rebuild_internal(uuid) from public, anon, authenticated;

create or replace function rebuild_survey_stats(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only admins can recalculate survey results.' using errcode = '42501';
  end if;
  perform survey_stats_rebuild_internal(p_template_id);
end;
$$;
revoke all on function rebuild_survey_stats(uuid) from public, anon;
grant execute on function rebuild_survey_stats(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Open-text answers, newest first, paged (admin read through RLS).
-- -----------------------------------------------------------------------------
create or replace function survey_text_answers(p_question_id uuid, p_limit int default 5, p_offset int default 0)
returns table (reference text, submitted_at timestamptz, answer text)
language sql
stable
set search_path = public
as $$
  select r.reference, r.submitted_at, a.value #>> '{}'
    from survey_answers a
    join survey_responses r on r.id = a.response_id
   where a.question_id = p_question_id
     and r.quality_status <> 'reject'
     and jsonb_typeof(a.value) = 'string'
     and btrim(a.value #>> '{}') <> ''
   order by r.submitted_at desc
   limit least(greatest(coalesce(p_limit, 5), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke all on function survey_text_answers(uuid, int, int) from public, anon;
grant execute on function survey_text_answers(uuid, int, int) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Anonymised export rows.
-- -----------------------------------------------------------------------------

-- One random salt per database, for the per-person pseudonym. No policies,
-- no grants: only the definer function below reads it.
create table if not exists survey_export_secret (
  id   boolean primary key default true check (id),
  salt text not null default (gen_random_uuid()::text || gen_random_uuid()::text)
);
alter table survey_export_secret enable row level security;
insert into survey_export_secret (id) values (true) on conflict (id) do nothing;
revoke all on survey_export_secret from anon, authenticated;

create or replace function survey_export_rows(
  p_template_id uuid,
  p_after_no bigint default 0,
  p_limit int default 500,
  p_include_rejected boolean default false
)
returns table (
  respondent_no      bigint,
  reference          text,
  person_key         text,
  source             text,
  started_at         timestamptz,
  submitted_at       timestamptz,
  duration_seconds   int,
  questions_answered int,
  quality_status     text,
  quality_score      int,
  age_band           text,
  gender             text,
  country            text,
  answers            jsonb,
  answer_seconds     jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_salt text;
begin
  if not is_admin() then
    raise exception 'Only admins can export survey responses.' using errcode = '42501';
  end if;
  select s.salt into v_salt from survey_export_secret s where s.id;

  return query
  select r.respondent_no,
         r.reference,
         -- Same person -> same key across surveys (links pre and post), never
         -- reversible to who they are without the database's own salt.
         'PER-' || upper(substr(encode(sha256(convert_to(
           v_salt || coalesce(p.audience_profile_id::text, r.respondent_profile_id::text, lower(r.respondent_email), r.id::text),
           'UTF8')), 'hex'), 1, 10)),
         case when r.participation_id is null then 'public link' else 'event participant' end,
         r.started_at,
         r.submitted_at,
         greatest(extract(epoch from (r.submitted_at - r.started_at)), 0)::int,
         coalesce(ans.answered, 0)::int,
         r.quality_status,
         r.quality_score,
         coalesce(
           case
             when am.date_of_birth is null then null
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 18 then 'Under 18'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 25 then '18-24'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 35 then '25-34'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 45 then '35-44'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 55 then '45-54'
             when date_part('year', age(r.submitted_at::date, am.date_of_birth)) < 65 then '55-64'
             else '65+'
           end,
           r.age_range),
         am.gender,
         am.country_of_residence,
         coalesce(ans.answers, '{}'::jsonb),
         coalesce(ans.seconds, '{}'::jsonb)
    from survey_responses r
    left join participations p on p.id = r.participation_id
    left join audience_members am on am.profile_id = coalesce(p.audience_profile_id, r.respondent_profile_id)
    left join lateral (
      select jsonb_object_agg(a.question_id::text, a.value) as answers,
             jsonb_object_agg(a.question_id::text,
               round(extract(epoch from (a.answered_at - a.shown_at))::numeric, 1))
               filter (where a.shown_at is not null and a.answered_at >= a.shown_at) as seconds,
             count(*) filter (
               where jsonb_typeof(a.value) <> 'null'
                 and not (jsonb_typeof(a.value) = 'string' and btrim(a.value #>> '{}') = '')
                 and not (jsonb_typeof(a.value) = 'array' and jsonb_array_length(a.value) = 0)
             ) as answered
        from survey_answers a
        join survey_questions q on q.id = a.question_id
       where a.response_id = r.id
         and q.type <> 'hidden_field'   -- identity never leaves in an export
    ) ans on true
   where r.template_id = p_template_id
     and r.respondent_no > coalesce(p_after_no, 0)
     and (p_include_rejected or r.quality_status <> 'reject')
   order by r.respondent_no
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;
revoke all on function survey_export_rows(uuid, bigint, int, boolean) from public, anon;
grant execute on function survey_export_rows(uuid, bigint, int, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Backfill every existing survey's stats.
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select id from survey_templates loop
    perform survey_stats_rebuild_internal(t.id);
  end loop;
end $$;
