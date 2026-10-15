-- =============================================================================
-- 0070 — Upcoming → Open: a paid campaign's event is visible, but nobody can
-- register or take its survey until the team opens it (14 Oct standup).
--
-- Once the brand has paid and an event is agreed, the event shows to the
-- audience as "Upcoming" with all its details. Registration and the campaign's
-- surveys stay shut until an admin opens the campaign — after the artist has
-- confirmed the discount codes and the survey is final, and usually timed to
-- the social-media promotion, so possibly weeks later.
--
-- The switch lives on the CAMPAIGN, not the sponsored event: surveys belong to
-- campaigns (survey_templates.campaign_id) and a public survey can run before
-- any event is agreed; registration reaches the campaign through the
-- sponsored event. One campaign has at most one settled event (0021's partial
-- unique index), so "the campaign is open" and "its event is open" coincide.
--
-- 1. campaigns.opens_at (null = not open; a future value = scheduled opening,
--    no cron needed — every check compares with now()), opened_by,
--    open_override_reason.
-- 2. campaign_is_open(campaign) — the one rule. A sponsored event or survey
--    without a campaign (legacy self-serve sponsorships) is always open.
-- 3. survey_open_state(template) / sponsored_event_open_states(ids) — what the
--    survey and discover pages ask before showing a form. Definer: the
--    audience (and anon, for public survey links) can't read campaigns.
-- 4. Enforced on insert, not just hidden in the UI:
--      participations      → REGISTRATION_NOT_OPEN
--      survey_responses    → SURVEY_NOT_OPEN (pre-event surveys; a post-event
--                            one is only reachable by registered people)
--    Admins (and the service role) are exempt, so the team can test a survey
--    or add someone by hand before opening.
-- 5. admin_set_campaign_opening(campaign, action, opens_at, reason) — open now,
--    schedule, or close again. Opening needs the codes confirmed and a
--    published survey, or a written override reason (e.g. a campaign with no
--    survey). Written to admin_audit_log.
-- 6. Notification `campaign.registrations_open` — brand and artist hear when
--    their event opens (or is scheduled to).
--
-- BACKFILL: every campaign that is already taking responses or registrations
-- today — it has a published survey or a confirmed/completed event — is set
-- open from now, so nothing currently running closes (L4). Only campaigns
-- reaching that point from here on start shut.
-- =============================================================================

-- 1. Columns ---------------------------------------------------------------

alter table campaigns
  add column if not exists opens_at timestamptz,
  add column if not exists opened_by uuid references profiles(id) on delete set null,
  add column if not exists open_override_reason text
    check (open_override_reason is null or length(open_override_reason) <= 1000);

-- 2. The rule --------------------------------------------------------------

create or replace function campaign_is_open(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_campaign_id is null then true
    else coalesce((select c.opens_at is not null and c.opens_at <= now()
                     from public.campaigns c where c.id = p_campaign_id), true)
  end
$$;
revoke all on function campaign_is_open(uuid) from public;
grant execute on function campaign_is_open(uuid) to anon, authenticated, service_role;

-- 3. What pages ask ----------------------------------------------------------

-- Reveals only whether/when a survey opens — never who or how many.
create or replace function survey_open_state(p_template_id uuid)
returns table (is_open boolean, opens_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select t.kind <> 'pre_event' or public.campaign_is_open(t.campaign_id),
         (select c.opens_at from public.campaigns c where c.id = t.campaign_id)
    from public.survey_templates t
   where t.id = p_template_id
$$;
revoke all on function survey_open_state(uuid) from public;
grant execute on function survey_open_state(uuid) to anon, authenticated, service_role;

create or replace function sponsored_event_open_states(p_ids uuid[])
returns table (id uuid, is_open boolean, opens_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select se.id,
         public.campaign_is_open(se.campaign_id),
         (select c.opens_at from public.campaigns c where c.id = se.campaign_id)
    from public.sponsored_events se
   where se.id = any(p_ids)
$$;
revoke all on function sponsored_event_open_states(uuid[]) from public;
grant execute on function sponsored_event_open_states(uuid[]) to anon, authenticated, service_role;

-- 4. Enforcement -------------------------------------------------------------

create or replace function participations_require_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  -- security definer changes current_user, so ask about the real caller.
  if is_admin() or auth.uid() is null then
    return new;
  end if;
  select se.campaign_id into v_campaign
    from public.sponsored_events se where se.id = new.sponsored_event_id;
  if not public.campaign_is_open(v_campaign) then
    -- The register actions match on this text and show "opens soon".
    raise exception 'REGISTRATION_NOT_OPEN: registration for this event has not opened yet'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists participations_require_open on participations;
create trigger participations_require_open
  before insert on participations
  for each row execute function participations_require_open();

create or replace function survey_responses_require_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
begin
  if is_admin() then
    return new;
  end if;
  -- Pre-event surveys only. A post-event survey is answered by people already
  -- registered (survey_participation_for), so it needs no gate of its own —
  -- and closing registration after the event mustn't stop attendees giving
  -- their post-event feedback.
  select t.campaign_id into v_campaign
    from public.survey_templates t where t.id = new.template_id and t.kind = 'pre_event';
  if found and not public.campaign_is_open(v_campaign) then
    raise exception 'SURVEY_NOT_OPEN: this survey has not opened yet'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists survey_responses_require_open on survey_responses;
create trigger survey_responses_require_open
  before insert on survey_responses
  for each row execute function survey_responses_require_open();

-- 5. Opening -----------------------------------------------------------------

create or replace function admin_set_campaign_opening(
  p_campaign_id uuid,
  p_action      text,                       -- 'open' | 'schedule' | 'close'
  p_opens_at    timestamptz default null,   -- required for 'schedule'
  p_reason      text default null           -- override when not ready
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c        campaigns%rowtype;
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_settled  record;
  v_survey   boolean;
  v_missing  text[] := '{}';
  v_at       timestamptz;
begin
  if not is_admin() then
    raise exception 'Only an admin can open a campaign.' using errcode = '42501';
  end if;
  if v_reason is not null and length(v_reason) > 1000 then
    raise exception 'The reason is too long (1,000 characters at most).';
  end if;

  select * into v_c from campaigns where id = p_campaign_id for update;
  if not found then
    raise exception 'Campaign not found.';
  end if;

  select se.id, se.name, se.reward_codes_confirmed_at, se.artist_profile_id
    into v_settled
    from sponsored_events se
   where se.campaign_id = v_c.id and se.status in ('confirmed', 'completed')
   limit 1;

  if p_action = 'close' then
    if v_c.opens_at is null then
      raise exception 'This campaign isn''t open.';
    end if;
    update campaigns set opens_at = null, opened_by = null, open_override_reason = null where id = v_c.id;
    perform log_admin_action('campaign.close_registrations', 'campaign', v_c.id::text,
      jsonb_build_object('was_open_from', v_c.opens_at));
    return jsonb_build_object('opens_at', null);
  end if;

  if p_action = 'open' then
    v_at := now();
  elsif p_action = 'schedule' then
    if p_opens_at is null or p_opens_at <= now() then
      raise exception 'Pick a date and time in the future.';
    end if;
    v_at := p_opens_at;
  else
    raise exception 'Unknown action.';
  end if;

  if v_c.status <> 'in_progress' then
    raise exception 'Only a paid, running campaign can be opened.';
  end if;

  select exists (select 1 from survey_templates t
                  where t.campaign_id = v_c.id and t.status = 'published')
    into v_survey;
  if v_settled.id is null then
    v_missing := array_append(v_missing, 'no event is agreed yet'::text);
  elsif v_settled.reward_codes_confirmed_at is null then
    v_missing := array_append(v_missing, 'the artist hasn''t confirmed the discount codes'::text);
  end if;
  if not v_survey then
    v_missing := array_append(v_missing, 'no survey is published'::text);
  end if;
  if array_length(v_missing, 1) > 0 and v_reason is null then
    raise exception 'Not ready to open: %. Give a reason to open it anyway.', array_to_string(v_missing, '; ');
  end if;

  update campaigns
     set opens_at = v_at,
         opened_by = auth.uid(),
         open_override_reason = case when array_length(v_missing, 1) > 0 then v_reason end
   where id = v_c.id;

  perform log_admin_action('campaign.open_registrations', 'campaign', v_c.id::text,
    jsonb_build_object('opens_at', v_at, 'missing', to_jsonb(v_missing), 'override_reason', v_reason));

  return jsonb_build_object(
    'opens_at', v_at,
    'event', case when v_settled.id is null then null else jsonb_build_object(
      'id', v_settled.id, 'name', v_settled.name, 'artist_profile_id', v_settled.artist_profile_id) end);
end;
$$;

revoke all on function admin_set_campaign_opening(uuid, text, timestamptz, text) from public, anon;
grant execute on function admin_set_campaign_opening(uuid, text, timestamptz, text) to authenticated;

-- 6. Notification ------------------------------------------------------------

insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('campaign.registrations_open', 'Registrations open',
   'The team opened (or scheduled) registration and the survey for an agreed sponsored event.',
   'brand', 'The brand and the artist / organiser', '{user_name,event_name,opens_on}', 125)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('campaign.registrations_open', 'in_app', '{{event_name}} opens {{opens_on}}',
   'Registration and the survey for {{event_name}} open {{opens_on}}.'),
  ('campaign.registrations_open', 'email', '{{event_name}} opens {{opens_on}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Registration and the survey for {{event_name}} open {{opens_on}}. Audience members can now sign up, take the survey and receive their discount codes.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;

-- Backfill (see header) --------------------------------------------------------

update campaigns c
   set opens_at = now()
 where c.opens_at is null
   and (exists (select 1 from survey_templates t where t.campaign_id = c.id and t.status = 'published')
        or exists (select 1 from sponsored_events se
                    where se.campaign_id = c.id and se.status in ('confirmed', 'completed')));
