-- =============================================================================
-- 0119 — One tick for every partner brand (client, 13 Nov: "if a user ticks
-- 'sign me up' once it should apply to all brands; they untick it from their
-- profile, not from each event").
--
-- Until now the tick was per event (participations.newsletter_opt_in) and
-- meant "this event's partner". Now it is a person-level choice:
--   * audience_members.partner_marketing_all — on while the person wants the
--     newsletters & promotions of the partner brands whose events they join;
--   * ticking it on My events (or switching it on in the profile) goes through
--     set_partner_marketing_all(), which also ticks every event they are
--     registered for, so each brand's subscription and the consent log
--     (0080 / 0116 triggers) stay exactly as they were — one record per
--     event, per brand;
--   * a new registration inherits it (BEFORE INSERT trigger) — except for a
--     brand the person has explicitly unsubscribed from (email link, one-click,
--     complaint or admin), which is respected;
--   * "unsubscribe from all" in an email switches it off.
-- Brands the person has never joined an event of can't email them: the send
-- audience is still brand_subscriptions (0116).
--
-- Additive and re-runnable.
-- =============================================================================

alter table public.audience_members
  add column if not exists partner_marketing_all boolean not null default false;

-- 1. Switch it on/off for the signed-in person (definer: it writes ticks on
--    all their registrations and must not depend on client-side write grants).
create or replace function public.set_partner_marketing_all(p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;
  if not exists (select 1 from audience_members where profile_id = v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_audience');
  end if;

  update audience_members set partner_marketing_all = coalesce(p_on, false) where profile_id = v_uid;

  -- (No les.consent_source here: marketing_sync_subscription() treats that setting
  -- as "an unsubscribe already set the brand state" and would skip subscribing.
  -- The consent log already records an UPDATE as source 'my_events'.)
  if p_on then
    update participations set newsletter_opt_in = true
     where audience_profile_id = v_uid and status <> 'rejected' and not coalesce(newsletter_opt_in, false);
  else
    update participations set newsletter_opt_in = false
     where audience_profile_id = v_uid and coalesce(newsletter_opt_in, false);
  end if;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'on', coalesce(p_on, false), 'events_updated', v_n);
end;
$$;
revoke all on function public.set_partner_marketing_all(boolean) from public, anon;
grant execute on function public.set_partner_marketing_all(boolean) to authenticated, service_role;

-- 2. A new registration inherits the choice (never blocks a registration).
create or replace function public.participations_inherit_partner_marketing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid;
begin
  begin
    if not coalesce(new.newsletter_opt_in, false)
       and exists (select 1 from audience_members am
                    where am.profile_id = new.audience_profile_id and am.partner_marketing_all) then
      select se.brand_id into v_brand from sponsored_events se where se.id = new.sponsored_event_id;
      if v_brand is null
         or not exists (select 1 from brand_subscriptions bs
                         where bs.profile_id = new.audience_profile_id and bs.brand_id = v_brand
                           and bs.status = 'unsubscribed'
                           and bs.source in ('link', 'one_click', 'complaint', 'admin')) then
        new.newsletter_opt_in := true;
      end if;
    end if;
  exception when others then
    raise warning 'participations_inherit_partner_marketing (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists participations_inherit_partner_marketing on public.participations;
create trigger participations_inherit_partner_marketing
  before insert on public.participations
  for each row execute function public.participations_inherit_partner_marketing();
revoke all on function public.participations_inherit_partner_marketing() from public, anon, authenticated;

-- 3. "Unsubscribe from all" also switches the person-level choice off (the
--    0116 function, unchanged except for that one statement).
create or replace function public.marketing_unsubscribe(
  p_profile_id uuid,
  p_brand_id   uuid,
  p_scope      text,
  p_source     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email  text;
  v_name   text;
  v_was    text;
  v_consent text := case p_source when 'link' then 'unsubscribe_link' when 'one_click' then 'one_click_unsubscribe'
                                  when 'complaint' then 'spam_complaint' else 'admin' end;
begin
  if p_scope not in ('brand', 'all') or p_source not in ('link', 'one_click', 'complaint', 'admin') then
    raise exception 'bad unsubscribe request' using errcode = 'P0001';
  end if;
  select lower(email) into v_email from profiles where id = p_profile_id;
  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  select brand_name into v_name from brands where id = p_brand_id;
  select status into v_was from brand_subscriptions where profile_id = p_profile_id and brand_id = p_brand_id;

  perform set_config('les.consent_source', v_consent, true);

  -- The partner-newsletter ticks go off too, each logged as a withdrawal.
  update participations p set newsletter_opt_in = false
    from sponsored_events se
   where se.id = p.sponsored_event_id and p.audience_profile_id = p_profile_id and p.newsletter_opt_in
     and (p_scope = 'all' or se.brand_id = p_brand_id);

  if p_scope = 'all' then
    update audience_members set partner_marketing_all = false where profile_id = p_profile_id;
    update brand_subscriptions
       set status = 'unsubscribed', unsubscribed_at = now(), source = p_source, updated_at = now()
     where profile_id = p_profile_id and status = 'subscribed';
    insert into marketing_suppressions (email, reason, profile_id)
    values (v_email, case when p_source = 'complaint' then 'complaint' else 'unsub_all' end, p_profile_id)
    on conflict (email) do update
      set reason = case when marketing_suppressions.reason = 'complaint' or excluded.reason = 'complaint'
                        then 'complaint' else excluded.reason end;
  end if;

  if p_brand_id is not null then
    insert into brand_subscriptions (profile_id, brand_id, status, unsubscribed_at, source, updated_at)
    values (p_profile_id, p_brand_id, 'unsubscribed', now(), p_source, now())
    on conflict (profile_id, brand_id) do update
      set status = 'unsubscribed',
          unsubscribed_at = coalesce(case when brand_subscriptions.status = 'unsubscribed' then brand_subscriptions.unsubscribed_at end, now()),
          source = case when brand_subscriptions.status = 'unsubscribed' then brand_subscriptions.source else p_source end,
          updated_at = now();
  end if;

  perform set_config('les.consent_source', '', true);
  return jsonb_build_object('ok', true, 'brand_name', v_name, 'already', v_was = 'unsubscribed' and p_scope = 'brand');
end;
$$;
revoke all on function public.marketing_unsubscribe(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.marketing_unsubscribe(uuid, uuid, text, text) to service_role;
