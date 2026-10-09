-- =============================================================================
-- Live-En-Synergy — live campaign visibility rules + admin audit log
-- (Admin Portal brief, 9 Oct: "Live Campaign" section and Compliance & Audit).
--
-- The brief's visibility rules for a running campaign:
--   order form            artist sees only the "ok for artist" sections (0054/0058)
--   survey links          brand + artist
--   participant total     brand + artist
--   code issued status    brand + artist — but WHICH participant got WHICH code
--                         is admin-only ("the artist might be able to identify
--                         their personal details through the code redeemed on
--                         their tickets")
--   survey results        brand only (aggregated, anonymised)
--   check-in              audience + artist
--
-- 1. reward_codes: the sponsorship parties could read every column, including
--    participation_id and redeemed_by, so a brand or artist could join a code
--    to a named participant through the SDK even though no screen showed it.
--    They now read codes through sponsored_event_party_codes (no participant
--    or redeemer columns); the table itself is recipient + admin only.
-- 2. campaign_party_surveys(): brand and linked artist get the campaign's
--    published survey links (they have no read policy on survey_templates).
-- 3. brand_survey_results(): the brand gets per-question totals from 0059's
--    counters — no open text, no attention checks, no hidden fields, nothing
--    per person, and nothing at all below 5 counted responses.
-- 4. admin_audit_log + log_admin_action(): who did what, starting with data
--    exports. compliance_overview(): the counts the Compliance page shows.
--
-- All additive apart from the reward_codes policy swap, which narrows access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Reward codes: parties read a view without participant columns.
-- -----------------------------------------------------------------------------
drop policy if exists "reward_codes: recipient or parties or admin read" on reward_codes;
drop policy if exists "reward_codes: recipient or admin read" on reward_codes;
create policy "reward_codes: recipient or admin read"
  on reward_codes for select
  using (
    is_admin()
    or exists (
      select 1 from participations p
      where p.id = reward_codes.participation_id and p.audience_profile_id = auth.uid()
    )
  );

-- Not security_invoker: reads past reward_codes' RLS with the owner's access,
-- the column list and the party check doing the restricting (same technique
-- as public_*_profiles and sponsored_event_survey_completions).
create or replace view sponsored_event_party_codes as
  select rc.id,
         rc.code,
         rc.sponsored_event_id,
         rc.tier_id,
         rc.code_type,
         rc.value_label,
         rc.value_gbp,
         rc.status,
         rc.issued_at,
         rc.redeemed_at,
         rc.expires_at,
         rc.is_shared,
         rc.external_ref,
         rc.redemption_platform,
         rc.redemption_url,
         rc.redemption_instructions,
         rc.created_at
    from reward_codes rc
    join sponsored_events se on se.id = rc.sponsored_event_id
    left join brands b on b.id = se.brand_id
   where is_admin()
      or b.profile_id = auth.uid()
      or se.artist_profile_id = auth.uid();

grant select on sponsored_event_party_codes to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Survey links for the campaign's brand and linked artist.
-- -----------------------------------------------------------------------------
create or replace function campaign_party_surveys(p_campaign_id uuid)
returns table (id uuid, kind text, title text, status text, is_public boolean, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.kind::text, t.title, t.status::text, t.is_public, t.published_at
    from survey_templates t
   where t.campaign_id = p_campaign_id
     and t.status in ('published', 'archived')
     and (
       is_admin()
       or exists (
         select 1 from campaigns c join brands b on b.id = c.brand_id
          where c.id = p_campaign_id and b.profile_id = auth.uid()
       )
       or exists (
         select 1 from sponsored_events se
          where se.campaign_id = p_campaign_id
            and se.artist_profile_id = auth.uid()
            and se.status in ('confirmed', 'completed')
       )
     )
   order by t.kind, t.published_at;
$$;
revoke all on function campaign_party_surveys(uuid) from public, anon;
grant execute on function campaign_party_surveys(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Brand-facing survey results — aggregates only.
-- -----------------------------------------------------------------------------
create or replace function brand_survey_results(p_template_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t        record;
  v_stats    record;
  v_counted  int;
  v_min      constant int := 5;   -- below this, per-question results could single people out
  v_questions jsonb;
begin
  select t.id, t.title, t.kind, t.status, t.campaign_id into v_t
    from survey_templates t
   where t.id = p_template_id and t.status in ('published', 'archived');
  if not found then
    return null;
  end if;
  if not (
    is_admin()
    or exists (
      select 1 from campaigns c join brands b on b.id = c.brand_id
       where c.id = v_t.campaign_id and b.profile_id = auth.uid()
    )
  ) then
    return null;
  end if;

  select * into v_stats from survey_template_stats where template_id = p_template_id;
  v_counted := coalesce(v_stats.pending_count, 0) + coalesce(v_stats.pass_count, 0) + coalesce(v_stats.review_count, 0);

  if v_counted >= v_min then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', q.id,
             'order_index', q.order_index,
             'type', q.type,
             'prompt', q.prompt,
             'options', (select coalesce(jsonb_agg(jsonb_build_object('label', o->>'label', 'value', o->>'value')), '[]'::jsonb)
                           from jsonb_array_elements(coalesce(q.options, '[]'::jsonb)) o),
             'config', jsonb_build_object('min', q.config->'min', 'max', q.config->'max', 'step', q.config->'step', 'na_label', q.config->'na_label'),
             'answered_count', coalesce(s.answered_count, 0),
             'num_count', coalesce(s.num_count, 0),
             'num_sum', coalesce(s.num_sum, 0),
             'num_sumsq', coalesce(s.num_sumsq, 0),
             'na_count', coalesce(s.na_count, 0),
             'option_counts', coalesce(s.option_counts, '{}'::jsonb),
             'rank_sums', coalesce(s.rank_sums, '{}'::jsonb)
           ) order by q.order_index), '[]'::jsonb)
      into v_questions
      from survey_questions q
      left join survey_question_stats s on s.question_id = q.id
     where q.template_id = p_template_id
       -- Open text can carry names / numbers people typed; attention checks
       -- and hidden fields are quality / identity plumbing. None go to brands.
       and q.type in ('single_choice', 'multiple_choice', 'dropdown', 'yes_no', 'scale', 'number', 'ranking');
  end if;

  return jsonb_build_object(
    'title', v_t.title,
    'kind', v_t.kind,
    'status', v_t.status,
    'counted', v_counted,
    'min_responses', v_min,
    'last_response_at', v_stats.last_response_at,
    'questions', coalesce(v_questions, '[]'::jsonb)
  );
end;
$$;
revoke all on function brand_survey_results(uuid) from public, anon;
grant execute on function brand_survey_results(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Admin audit log.
-- -----------------------------------------------------------------------------
create table if not exists admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references profiles (id) on delete set null,
  action      text not null,          -- e.g. 'survey.export', 'participants.export'
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on admin_audit_log (created_at desc);
create index if not exists admin_audit_log_action_idx on admin_audit_log (action, created_at desc);

alter table admin_audit_log enable row level security;
drop policy if exists "admin_audit_log: admin read" on admin_audit_log;
create policy "admin_audit_log: admin read" on admin_audit_log for select using (is_admin());
-- No insert/update/delete policies: rows arrive only through log_admin_action(),
-- and nobody (admins included) can edit or remove them through the API.

create or replace function log_admin_action(
  p_action text, p_target_type text default null, p_target_id text default null, p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Only admins write the audit log.' using errcode = '42501';
  end if;
  insert into admin_audit_log (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), left(p_action, 100), left(p_target_type, 100), left(p_target_id, 200), coalesce(p_detail, '{}'::jsonb));
end;
$$;
revoke all on function log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function log_admin_action(text, text, text, jsonb) to authenticated;

-- Counts for the Compliance & audit page, in one admin-checked call.
create or replace function compliance_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'terms_versions', (
      select coalesce(jsonb_agg(jsonb_build_object('version', v, 'accounts', n) order by n desc), '[]'::jsonb)
        from (select coalesce(terms_version, 'not recorded') as v, count(*) as n from profiles group by 1) x
    ),
    'accounts_total', (select count(*) from profiles),
    'accounts_blocked', (select count(*) from profiles where is_active = false),
    'inactive_12_months', (select count(*) from profiles where coalesce(last_seen_at, created_at) < now() - interval '12 months'),
    'newsletter_opt_in', (select count(*) from participations where newsletter_opt_in),
    'newsletter_opt_out', (select count(*) from participations where not newsletter_opt_in),
    'participation_terms_accepted', (select count(*) from participations where terms_accepted_at is not null),
    'survey_consents', (select count(*) from survey_responses where consent_accepted_at is not null),
    'order_forms_approved', (select count(*) from campaign_order_forms where status = 'approved'),
    'audit_events_30_days', (select count(*) from admin_audit_log where created_at > now() - interval '30 days')
  );
end;
$$;
revoke all on function compliance_overview() from public, anon;
grant execute on function compliance_overview() to authenticated;
