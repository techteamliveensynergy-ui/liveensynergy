-- =============================================================================
-- Live-En-Synergy — survey response cap (GitHub #8, 5 Oct standup).
--
-- A survey stops accepting responses once it reaches the expected number of
-- participants plus a buffer (10% by default; the brief said 10–15%). After
-- that, respondents see a "this survey has closed" screen instead of the form.
--
-- expected_participants is set on the template; left empty, it falls back to
-- the campaign order form's "approx. number of participants" (0054). No
-- number at all = no cap (today's behaviour).
--
-- Enforcement is a BEFORE INSERT trigger on survey_responses, so it covers
-- both submit RPCs (0037 / 0043) without redeclaring them. It locks the
-- template row first, so concurrent submissions can't race past the cap.
-- Responses the quality engine rejected (bots, duplicates) don't use a place.
-- =============================================================================

alter table survey_templates
  add column if not exists expected_participants int
    check (expected_participants is null or expected_participants > 0),
  add column if not exists response_buffer_pct int not null default 10
    check (response_buffer_pct between 0 and 100);

-- The cap for a template: null when there is no expected number.
create or replace function survey_response_limit(p_template_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
           when coalesce(t.expected_participants, f.approx_participants) is null then null
           else ceil(coalesce(t.expected_participants, f.approx_participants)
                     * (100 + t.response_buffer_pct) / 100.0)::int
         end
    from public.survey_templates t
    left join public.campaign_order_forms f on f.campaign_id = t.campaign_id
   where t.id = p_template_id
$$;
revoke all on function survey_response_limit(uuid) from public;
grant execute on function survey_response_limit(uuid) to anon, authenticated, service_role;

-- What a survey page needs to decide "closed" before showing the form.
-- Readable by anyone who can open the survey (anon for public links): it
-- reveals only counts, never responses.
create or replace function survey_capacity(p_template_id uuid)
returns table (response_limit int, responses int, is_full boolean)
language sql
stable
security definer
set search_path = public
as $$
  with lim as (select public.survey_response_limit(p_template_id) as l),
       cnt as (
         select count(*)::int as c
           from public.survey_responses
          where template_id = p_template_id
            and quality_status <> 'reject'
       )
  select lim.l, cnt.c, (lim.l is not null and cnt.c >= lim.l)
    from lim, cnt
$$;
revoke all on function survey_capacity(uuid) from public;
grant execute on function survey_capacity(uuid) to anon, authenticated, service_role;

create or replace function survey_responses_enforce_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_count int;
begin
  -- Serialise submissions per template so two can't both take the last place.
  perform 1 from public.survey_templates where id = new.template_id for update;

  v_limit := public.survey_response_limit(new.template_id);
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_count
    from public.survey_responses
   where template_id = new.template_id
     and quality_status <> 'reject';
  if v_count >= v_limit then
    -- The submit actions match on this text and show the "closed" screen.
    raise exception 'SURVEY_CLOSED: this survey has reached its response limit'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists survey_responses_enforce_cap on survey_responses;
create trigger survey_responses_enforce_cap
  before insert on survey_responses
  for each row execute function survey_responses_enforce_cap();
