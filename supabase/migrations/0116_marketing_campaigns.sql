-- =============================================================================
-- 0116 — Marketing email campaigns (admin "Marketing" tab).
-- Plan: "Multi-Brand Marketing Email System" (10 Nov). Resend is only the
-- delivery pipe; the audience, consent, suppression and send state live here.
--
-- Who may be emailed for a brand: an audience member who ticked "Partner
-- newsletter & promotions" for one of that brand's events (participations.
-- newsletter_opt_in, logged in consent_records since 0080). No imported lists
-- (client decision, 10 Nov). brand_subscriptions is the per-brand state; this
-- migration back-fills it from today's ticks and keeps it in step from now on.
--
--   1. brand_subscriptions        per person per brand, never deleted, only marked
--   2. marketing_suppressions     marketing-only block list (unsubscribe-all,
--                                 complaint, hard bounce). Transactional mail
--                                 (password resets, codes) is NOT affected — that
--                                 still uses email_suppressions (0046).
--   3. brand_marketing_settings   brand tokens + pause flag
--   4. marketing_campaigns        draft → scheduled → sending → sent (paused /
--                                 cancelled); content locked once sending starts
--   5. marketing_sends            one row per recipient: the resume point, so a
--                                 crashed worker never double-sends
--   6. marketing_webhook_events   delivery events that arrive before the send
--                                 row has its message id — kept and reconciled
-- Unsubscribing writes the consent log too (new sources), and un-ticks the
-- partner-newsletter box on that brand's events so My events tells the truth.
-- Re-runnable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Consent log: sources for withdrawals made outside My events
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
  v_known text[] := array['dashboard_survey','event_registration','fulfilment_form','my_events','order_form',
                          'public_survey','sign_up','survey_sign_up','verify_link',
                          'unsubscribe_link','one_click_unsubscribe','spam_complaint','admin'];
  v_all text[];
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.consent_records'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table public.consent_records drop constraint %I', c.conname);
  end loop;
  select array(select distinct v from unnest(v_known || array(select distinct source from public.consent_records)) v
               where v is not null order by 1) into v_all;
  execute format('alter table public.consent_records add constraint consent_records_source_check check (source = any (%L::text[]))', v_all);
end $$;

-- 0080's trigger, with the source taken from the transaction when a caller sets
-- it (an unsubscribe link, a one-click unsubscribe, a spam complaint).
create or replace function public.consent_from_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx jsonb;
  v_email text;
  v_source text := nullif(current_setting('les.consent_source', true), '');
begin
  begin
    select jsonb_build_object('sponsored_event_id', se.id, 'event_reference', se.reference, 'event_name', se.name)
      into v_ctx
      from sponsored_events se where se.id = new.sponsored_event_id;
    select email into v_email from profiles where id = new.audience_profile_id;

    if tg_op = 'INSERT' and new.terms_accepted_at is not null then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, context, recorded_at)
      values (new.audience_profile_id, v_email, 'event_terms', true, 'event_registration',
              coalesce(v_ctx, '{}'::jsonb), new.terms_accepted_at);
    end if;

    if (tg_op = 'INSERT' and new.newsletter_opt_in)
       or (tg_op = 'UPDATE' and new.newsletter_opt_in is distinct from old.newsletter_opt_in) then
      insert into consent_records (profile_id, subject_email, consent_type, granted, source, context)
      values (new.audience_profile_id, v_email, 'sponsor_marketing', coalesce(new.newsletter_opt_in, false),
              coalesce(v_source, case when tg_op = 'INSERT' then 'event_registration' else 'my_events' end),
              coalesce(v_ctx, '{}'::jsonb));
    end if;
  exception when others then
    raise warning 'consent_from_participation (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Per-brand subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.brand_subscriptions (
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  brand_id        uuid not null references public.brands (id) on delete cascade,
  status          text not null check (status in ('subscribed', 'unsubscribed')),
  subscribed_at   timestamptz,
  unsubscribed_at timestamptz,
  source          text not null check (source in ('signup', 'my_events', 'link', 'one_click', 'complaint', 'admin', 'backfill')),
  updated_at      timestamptz not null default now(),
  primary key (profile_id, brand_id)
);
create index if not exists brand_subscriptions_brand_idx on public.brand_subscriptions (brand_id, status);

alter table public.brand_subscriptions enable row level security;
drop policy if exists "brand_subscriptions: admin" on public.brand_subscriptions;
create policy "brand_subscriptions: admin" on public.brand_subscriptions
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "brand_subscriptions: own read" on public.brand_subscriptions;
create policy "brand_subscriptions: own read" on public.brand_subscriptions
  for select using (profile_id = auth.uid());
grant select on public.brand_subscriptions to authenticated;
grant all on public.brand_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- 2. Marketing-only suppressions
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_suppressions (
  email      text primary key check (email = lower(email)),
  reason     text not null check (reason in ('unsub_all', 'complaint', 'hard_bounce')),
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.marketing_suppressions enable row level security;
drop policy if exists "marketing_suppressions: admin" on public.marketing_suppressions;
create policy "marketing_suppressions: admin" on public.marketing_suppressions
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.marketing_suppressions to authenticated;
grant all on public.marketing_suppressions to service_role;

-- ---------------------------------------------------------------------------
-- 3. Brand tokens + pause
-- ---------------------------------------------------------------------------
create table if not exists public.brand_marketing_settings (
  brand_id         uuid primary key references public.brands (id) on delete cascade,
  logo_url         text check (logo_url is null or char_length(logo_url) <= 1000),
  accent_color     text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  background       text not null default 'light' check (background in ('light', 'dark')),
  font_stack       text check (font_stack is null or char_length(font_stack) <= 200),
  footer_legal     text check (footer_legal is null or char_length(footer_legal) <= 500),
  physical_address text check (physical_address is null or char_length(physical_address) <= 300),
  reply_to         text check (reply_to is null or char_length(reply_to) <= 254),
  paused_at        timestamptz,
  paused_reason    text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles (id) on delete set null
);
alter table public.brand_marketing_settings enable row level security;
drop policy if exists "brand_marketing_settings: admin" on public.brand_marketing_settings;
create policy "brand_marketing_settings: admin" on public.brand_marketing_settings
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.brand_marketing_settings to authenticated;
grant all on public.brand_marketing_settings to service_role;

-- ---------------------------------------------------------------------------
-- 4. Campaigns
-- ---------------------------------------------------------------------------
create sequence if not exists public.marketing_campaign_ref_seq;

create table if not exists public.marketing_campaigns (
  id            uuid primary key default gen_random_uuid(),
  reference     text unique not null default ('MKT-' || lpad(nextval('public.marketing_campaign_ref_seq')::text, 5, '0')),
  brand_id      uuid not null references public.brands (id) on delete restrict,
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  subject       text not null default '' check (char_length(subject) <= 200),
  preview_text  text not null default '' check (char_length(preview_text) <= 200),
  -- { blocks: [...] } — see src/lib/marketing/blocks.ts
  content       jsonb not null default '{"blocks": []}'::jsonb,
  -- { type: 'all' } or { type: 'events', event_ids: [...] } (people who opted in at those events)
  segment       jsonb not null default '{"type": "all"}'::jsonb,
  status        text not null default 'draft'
                  check (status in ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled')),
  scheduled_at  timestamptz,
  started_at    timestamptz,
  finished_at   timestamptz,
  paused_reason text,
  test_sent_at  timestamptz,
  recipients    integer not null default 0,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists marketing_campaigns_status_idx on public.marketing_campaigns (status, scheduled_at);

alter table public.marketing_campaigns enable row level security;
drop policy if exists "marketing_campaigns: admin" on public.marketing_campaigns;
create policy "marketing_campaigns: admin" on public.marketing_campaigns
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
grant all on public.marketing_campaigns to service_role;
grant usage on sequence public.marketing_campaign_ref_seq to authenticated, service_role;

-- What people receive can't change once sending starts.
create or replace function public.marketing_campaigns_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if old.status in ('sending', 'paused', 'sent', 'cancelled')
     and (new.content is distinct from old.content
          or new.subject is distinct from old.subject
          or new.preview_text is distinct from old.preview_text
          or new.segment is distinct from old.segment
          or new.brand_id is distinct from old.brand_id) then
    raise exception 'MARKETING_LOCKED: a campaign can''t be edited once sending has started' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists marketing_campaigns_lock on public.marketing_campaigns;
create trigger marketing_campaigns_lock
  before update on public.marketing_campaigns
  for each row execute function public.marketing_campaigns_lock();

-- ---------------------------------------------------------------------------
-- 5. Sends (one per recipient)
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_sends (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.marketing_campaigns (id) on delete cascade,
  profile_id          uuid references public.profiles (id) on delete set null,
  email               text not null,
  first_name          text,
  status              text not null default 'queued'
                        check (status in ('queued', 'sending', 'sent', 'delivered', 'bounced', 'complained', 'failed', 'skipped')),
  batch_key           text,
  attempts            integer not null default 0,
  next_attempt_at     timestamptz,
  provider_message_id text unique,
  skip_reason         text,
  error               text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (campaign_id, profile_id)
);
create index if not exists marketing_sends_work_idx on public.marketing_sends (campaign_id, status);
create index if not exists marketing_sends_batch_idx on public.marketing_sends (batch_key);

alter table public.marketing_sends enable row level security;
drop policy if exists "marketing_sends: admin read" on public.marketing_sends;
create policy "marketing_sends: admin read" on public.marketing_sends
  for select using (public.is_admin());
grant select on public.marketing_sends to authenticated;
grant all on public.marketing_sends to service_role;

create table if not exists public.marketing_webhook_events (
  id                  bigserial primary key,
  provider_message_id text not null,
  event_type          text not null,
  campaign_id         uuid,
  email               text,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz
);
create index if not exists marketing_webhook_events_msg_idx
  on public.marketing_webhook_events (provider_message_id) where processed_at is null;
alter table public.marketing_webhook_events enable row level security;
drop policy if exists "marketing_webhook_events: admin read" on public.marketing_webhook_events;
create policy "marketing_webhook_events: admin read" on public.marketing_webhook_events
  for select using (public.is_admin());
grant all on public.marketing_webhook_events to service_role;
grant usage on sequence public.marketing_webhook_events_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 6. Keep subscriptions in step with the partner-newsletter tick
-- ---------------------------------------------------------------------------
create or replace function public.marketing_sync_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid;
  v_email text;
begin
  begin
    -- An unsubscribe already set the brand state; don't overwrite its source.
    if nullif(current_setting('les.consent_source', true), '') is not null then
      return new;
    end if;
    select brand_id into v_brand from sponsored_events where id = new.sponsored_event_id;
    if v_brand is null then
      return new;
    end if;

    if new.newsletter_opt_in and (tg_op = 'INSERT' or old.newsletter_opt_in is distinct from true) then
      -- A tick is an explicit opt-in: (re)subscribe, and lift an earlier
      -- "unsubscribe from all" (never a complaint or a bounce).
      insert into brand_subscriptions (profile_id, brand_id, status, subscribed_at, source, updated_at)
      values (new.audience_profile_id, v_brand, 'subscribed', now(),
              case when tg_op = 'INSERT' then 'signup' else 'my_events' end, now())
      on conflict (profile_id, brand_id) do update
        set status = 'subscribed', subscribed_at = now(), unsubscribed_at = null,
            source = excluded.source, updated_at = now();
      select lower(email) into v_email from profiles where id = new.audience_profile_id;
      delete from marketing_suppressions where email = v_email and reason = 'unsub_all';
    elsif tg_op = 'UPDATE' and old.newsletter_opt_in and not coalesce(new.newsletter_opt_in, false) then
      -- Un-ticked: off this brand once no other event of the brand is ticked.
      if not exists (
        select 1 from participations p join sponsored_events se on se.id = p.sponsored_event_id
         where p.audience_profile_id = new.audience_profile_id and se.brand_id = v_brand
           and p.newsletter_opt_in and p.id <> new.id) then
        update brand_subscriptions
           set status = 'unsubscribed', unsubscribed_at = now(), source = 'my_events', updated_at = now()
         where profile_id = new.audience_profile_id and brand_id = v_brand and status = 'subscribed';
      end if;
    end if;
  exception when others then
    raise warning 'marketing_sync_subscription (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists participations_marketing_sync on public.participations;
create trigger participations_marketing_sync
  after insert or update of newsletter_opt_in on public.participations
  for each row execute function public.marketing_sync_subscription();

-- Back-fill: everyone ticked today is subscribed to that event's brand.
insert into public.brand_subscriptions (profile_id, brand_id, status, subscribed_at, source)
select distinct on (p.audience_profile_id, se.brand_id)
       p.audience_profile_id, se.brand_id, 'subscribed', coalesce(p.updated_at, p.created_at), 'backfill'
  from public.participations p
  join public.sponsored_events se on se.id = p.sponsored_event_id
 where p.newsletter_opt_in and se.brand_id is not null
 order by p.audience_profile_id, se.brand_id, p.updated_at desc
on conflict (profile_id, brand_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Leaving the list (called by the app with the service role only)
-- ---------------------------------------------------------------------------
-- p_scope 'brand' | 'all'. p_source 'link' | 'one_click' | 'complaint' | 'admin'.
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

-- What the confirm page shows (read-only).
create or replace function public.marketing_unsubscribe_state(p_profile_id uuid, p_brand_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'brand_name', (select brand_name from brands where id = p_brand_id),
    'status', (select status from brand_subscriptions where profile_id = p_profile_id and brand_id = p_brand_id),
    'all_blocked', exists (select 1 from marketing_suppressions s join profiles p on lower(p.email) = s.email
                            where p.id = p_profile_id),
    'account', exists (select 1 from profiles where id = p_profile_id))
$$;
revoke all on function public.marketing_unsubscribe_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.marketing_unsubscribe_state(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Audience
-- ---------------------------------------------------------------------------
-- Who may be emailed for this brand right now (the plan's pre-send filter):
-- subscribed to the brand, account active with an email, not on either
-- suppression list; optionally only people who opted in at chosen events.
create or replace function public.marketing_eligible(p_brand_id uuid, p_segment jsonb)
returns table (profile_id uuid, email text, first_name text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, lower(p.email), nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), '')
    from brand_subscriptions s
    join profiles p on p.id = s.profile_id
   where s.brand_id = p_brand_id
     and s.status = 'subscribed'
     and p.is_active
     and p.email is not null
     and not exists (select 1 from marketing_suppressions m where m.email = lower(p.email))
     and not exists (select 1 from email_suppressions e where e.email = lower(p.email))
     and (coalesce(p_segment->>'type', 'all') <> 'events'
          or exists (select 1 from participations pa
                      where pa.audience_profile_id = p.id and pa.newsletter_opt_in
                        and pa.sponsored_event_id::text in (select jsonb_array_elements_text(coalesce(p_segment->'event_ids', '[]'::jsonb)))))
$$;
revoke all on function public.marketing_eligible(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.marketing_eligible(uuid, jsonb) to service_role;

-- How many that is (admin screens).
create or replace function public.marketing_audience_count(p_brand_id uuid, p_segment jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  return (select count(*)::integer from public.marketing_eligible(p_brand_id, p_segment));
end;
$$;
revoke all on function public.marketing_audience_count(uuid, jsonb) from public, anon;
grant execute on function public.marketing_audience_count(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. The send pipeline (service role: the worker)
-- ---------------------------------------------------------------------------
-- Start a campaign: snapshot the audience into marketing_sends. Refuses a
-- paused brand. Idempotent (a second call adds nobody twice).
create or replace function public.marketing_start_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_n integer;
begin
  select * into v_c from marketing_campaigns where id = p_campaign_id for update;
  if not found or v_c.status not in ('scheduled', 'sending') then
    return jsonb_build_object('started', false, 'reason', 'not_ready');
  end if;
  if exists (select 1 from brand_marketing_settings where brand_id = v_c.brand_id and paused_at is not null) then
    update marketing_campaigns set status = 'paused', paused_reason = 'Brand sending is paused — review it in Brand settings.'
     where id = p_campaign_id;
    return jsonb_build_object('started', false, 'reason', 'brand_paused');
  end if;
  insert into marketing_sends (campaign_id, profile_id, email, first_name)
  select p_campaign_id, e.profile_id, e.email, e.first_name
    from marketing_eligible(v_c.brand_id, v_c.segment) e
  on conflict (campaign_id, profile_id) do nothing;
  select count(*) into v_n from marketing_sends where campaign_id = p_campaign_id;
  update marketing_campaigns
     set status = 'sending', started_at = coalesce(started_at, now()), recipients = v_n
   where id = p_campaign_id;
  return jsonb_build_object('started', true, 'recipients', v_n);
end;
$$;
revoke all on function public.marketing_start_campaign(uuid) from public, anon, authenticated;
grant execute on function public.marketing_start_campaign(uuid) to service_role;

-- Next batch to send. A batch that was claimed but not finished (worker died,
-- or Resend asked us to retry) comes back first with the SAME key — Resend's
-- Idempotency-Key — so it can't go out twice. A fresh batch re-checks every
-- recipient (unsubscribed or suppressed since the campaign started → skipped).
create or replace function public.marketing_claim_batch(p_campaign_id uuid, p_size integer default 100)
returns table (send_id uuid, profile_id uuid, email text, first_name text, batch_key text, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_c   record;
begin
  select * into v_c from marketing_campaigns where id = p_campaign_id for update;
  if not found or v_c.status <> 'sending' then
    return;
  end if;

  select s.batch_key into v_key
    from marketing_sends s
   where s.campaign_id = p_campaign_id and s.status = 'sending'
     and (s.next_attempt_at is null or s.next_attempt_at <= now())
   order by s.updated_at
   limit 1;

  if v_key is null then
    -- Fresh batch: drop anyone no longer eligible, then claim up to p_size.
    with page as (
      select s.id from marketing_sends s
       where s.campaign_id = p_campaign_id and s.status = 'queued'
       order by s.created_at, s.id
       limit p_size
       for update skip locked
    )
    update marketing_sends s
       set status = 'skipped', skip_reason = 'no longer subscribed', updated_at = now()
      from page
     where s.id = page.id
       and not exists (
         select 1 from brand_subscriptions b join profiles p on p.id = b.profile_id
          where b.profile_id = s.profile_id and b.brand_id = v_c.brand_id and b.status = 'subscribed'
            and p.is_active and p.email is not null
            and not exists (select 1 from marketing_suppressions m where m.email = lower(p.email))
            and not exists (select 1 from email_suppressions e where e.email = lower(p.email)));

    v_key := p_campaign_id::text || ':' || gen_random_uuid()::text;
    with page as (
      select s.id from marketing_sends s
       where s.campaign_id = p_campaign_id and s.status = 'queued'
       order by s.created_at, s.id
       limit p_size
       for update skip locked
    )
    update marketing_sends s
       set status = 'sending', batch_key = v_key, attempts = s.attempts + 1,
           next_attempt_at = null, updated_at = now()
      from page
     where s.id = page.id;
  else
    update marketing_sends s set attempts = s.attempts + 1, next_attempt_at = null, updated_at = now()
     where s.batch_key = v_key;
  end if;

  return query
    select s.id, s.profile_id, s.email, s.first_name, s.batch_key, s.attempts
      from marketing_sends s where s.batch_key = v_key and s.status = 'sending'
     order by s.created_at, s.id;
end;
$$;
revoke all on function public.marketing_claim_batch(uuid, integer) from public, anon, authenticated;
grant execute on function public.marketing_claim_batch(uuid, integer) to service_role;

-- The batch went out: record message ids ([{send_id, message_id}]), then apply
-- any delivery events that arrived before we knew the ids.
create or replace function public.marketing_complete_batch(p_batch_key text, p_results jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  ev record;
begin
  -- Each result is {send_id, message_id} or {send_id, error} (one address the
  -- provider refused when the batch was retried one by one).
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    if r ? 'error' then
      update marketing_sends
         set status = 'failed', error = left(r->>'error', 500), updated_at = now()
       where id = (r->>'send_id')::uuid and batch_key = p_batch_key and status = 'sending';
    else
      update marketing_sends
         set status = 'sent', provider_message_id = r->>'message_id', sent_at = now(), error = null, updated_at = now()
       where id = (r->>'send_id')::uuid and batch_key = p_batch_key and status = 'sending';
    end if;
  end loop;
  for ev in
    select w.* from marketing_webhook_events w
      join marketing_sends s on s.provider_message_id = w.provider_message_id
     where s.batch_key = p_batch_key and w.processed_at is null
     order by w.id
  loop
    perform public.marketing_apply_event(ev.provider_message_id, ev.event_type);
    update marketing_webhook_events set processed_at = now() where id = ev.id;
  end loop;
end;
$$;
revoke all on function public.marketing_complete_batch(text, jsonb) from public, anon, authenticated;
grant execute on function public.marketing_complete_batch(text, jsonb) to service_role;

-- The batch failed. Retryable (429/5xx/network): try the same batch again
-- later with backoff, up to 5 attempts; otherwise mark it failed.
create or replace function public.marketing_fail_batch(p_batch_key text, p_error text, p_retryable boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update marketing_sends
     set status = case when p_retryable and attempts < 5 then 'sending' else 'failed' end,
         next_attempt_at = case when p_retryable and attempts < 5
                                then now() + make_interval(secs => least(600, 15 * power(2, attempts)::int)) end,
         error = left(p_error, 500), updated_at = now()
   where batch_key = p_batch_key and status = 'sending';
end;
$$;
revoke all on function public.marketing_fail_batch(text, text, boolean) from public, anon, authenticated;
grant execute on function public.marketing_fail_batch(text, text, boolean) to service_role;

-- A delivery event for one message. Status only moves forward; a complaint or
-- a hard bounce takes the address off marketing for every brand, and a
-- complaint also unsubscribes it from this brand.
create or replace function public.marketing_apply_event(p_message_id text, p_type text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_brand uuid;
begin
  select ms.*, mc.brand_id into s
    from marketing_sends ms join marketing_campaigns mc on mc.id = ms.campaign_id
   where ms.provider_message_id = p_message_id;
  if not found then
    return false;
  end if;
  v_brand := s.brand_id;

  if p_type = 'delivered' and s.status = 'sent' then
    update marketing_sends set status = 'delivered', updated_at = now() where id = s.id;
  elsif p_type = 'bounced' and s.status in ('sent', 'delivered') then
    update marketing_sends set status = 'bounced', updated_at = now() where id = s.id;
    insert into marketing_suppressions (email, reason, profile_id) values (lower(s.email), 'hard_bounce', s.profile_id)
    on conflict (email) do nothing;
  elsif p_type = 'complained' and s.status in ('sent', 'delivered', 'bounced') then
    update marketing_sends set status = 'complained', updated_at = now() where id = s.id;
    if s.profile_id is not null then
      perform public.marketing_unsubscribe(s.profile_id, v_brand, 'all', 'complaint');
    else
      insert into marketing_suppressions (email, reason) values (lower(s.email), 'complaint')
      on conflict (email) do update set reason = 'complaint';
    end if;
  end if;

  perform public.marketing_check_health(s.campaign_id);
  return true;
end;
$$;
revoke all on function public.marketing_apply_event(text, text) from public, anon, authenticated;
grant execute on function public.marketing_apply_event(text, text) to service_role;

-- Auto-pause (the plan's guardrail): spam complaints over 0.1% or hard bounces
-- over 2% of what a campaign has sent pauses the campaign AND the brand until
-- an admin reviews it; admins are told.
create or replace function public.marketing_check_health(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c       record;
  v_sent    integer;
  v_bounced integer;
  v_compl   integer;
  v_reason  text;
  v_admin   record;
begin
  select * into v_c from marketing_campaigns where id = p_campaign_id;
  if not found or v_c.status not in ('sending', 'sent') then
    return false;
  end if;
  select count(*) filter (where status in ('sent', 'delivered', 'bounced', 'complained')),
         count(*) filter (where status = 'bounced'),
         count(*) filter (where status = 'complained')
    into v_sent, v_bounced, v_compl
    from marketing_sends where campaign_id = p_campaign_id;
  if v_sent = 0 then
    return false;
  end if;
  if v_compl::numeric / v_sent > 0.001 then
    v_reason := format('Spam complaints reached %s of %s sent (over 0.1%%).', v_compl, v_sent);
  elsif v_bounced::numeric / v_sent > 0.02 then
    v_reason := format('Hard bounces reached %s of %s sent (over 2%%).', v_bounced, v_sent);
  end if;
  if v_reason is null then
    return false;
  end if;

  insert into brand_marketing_settings (brand_id, paused_at, paused_reason)
  values (v_c.brand_id, now(), v_reason)
  on conflict (brand_id) do update
    set paused_at = coalesce(brand_marketing_settings.paused_at, now()),
        paused_reason = coalesce(brand_marketing_settings.paused_reason, excluded.paused_reason);
  if v_c.status = 'sending' then
    update marketing_campaigns set status = 'paused', paused_reason = v_reason where id = p_campaign_id;
  end if;
  if not exists (select 1 from brand_marketing_settings where brand_id = v_c.brand_id
                  and paused_at < now() - interval '1 second') then
    for v_admin in select id from profiles where role = 'admin' and is_active loop
      perform public.notify_from_db('admin.marketing_paused', v_admin.id,
        jsonb_build_object('campaign_name', v_c.name, 'reference', v_c.reference,
                           'brand_name', coalesce((select brand_name from brands where id = v_c.brand_id), 'the brand'),
                           'reason', v_reason),
        '/dashboard/admin/marketing/campaigns/' || p_campaign_id);
    end loop;
  end if;
  return true;
end;
$$;
revoke all on function public.marketing_check_health(uuid) from public, anon, authenticated;
grant execute on function public.marketing_check_health(uuid) to service_role;

-- Done when nothing is queued or in flight.
create or replace function public.marketing_finish_if_done(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from marketing_sends where campaign_id = p_campaign_id and status in ('queued', 'sending')) then
    return false;
  end if;
  update marketing_campaigns set status = 'sent', finished_at = now()
   where id = p_campaign_id and status = 'sending';
  return found;
end;
$$;
revoke all on function public.marketing_finish_if_done(uuid) from public, anon, authenticated;
grant execute on function public.marketing_finish_if_done(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Notification: auto-pause
-- ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.marketing_paused', 'Marketing sending paused',
   'A marketing campaign passed the spam-complaint or bounce limit; the campaign and the brand''s sending are paused for review.',
   'admin', 'All admins', '{campaign_name,reference,brand_name,reason}', 472)
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'notification_settings' and column_name = 'email_button') then
    insert into public.notification_settings (event_key, email_button) values ('admin.marketing_paused', true)
    on conflict (event_key) do nothing;
  end if;
end $$;
insert into public.notification_settings (event_key) values ('admin.marketing_paused') on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select v.event_key, v.channel, v.subject, v.body
  from (values
    ('admin.marketing_paused', 'in_app', 'Marketing paused: {{campaign_name}} ({{reference}})',
     '{{brand_name}}''s sending is paused. {{reason}} Review the list before resuming.'),
    ('admin.marketing_paused', 'email', 'Marketing sending paused for {{brand_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'Campaign {{campaign_name}} ({{reference}}) has been paused, and so has {{brand_name}}''s marketing sending.' || chr(10) || chr(10) ||
     '{{reason}}' || chr(10) || chr(10) ||
     'All brands share one sender reputation, so nothing more goes out for this brand until an admin reviews it and resumes it in Marketing → Brand settings.')
  ) as v(event_key, channel, subject, body)
 where not exists (select 1 from public.notification_templates t where t.event_key = v.event_key and t.channel = v.channel);

-- ---------------------------------------------------------------------------
-- 11. Permissions: trigger functions are not for clients
-- ---------------------------------------------------------------------------
revoke all on function public.marketing_sync_subscription() from public, anon, authenticated;
revoke all on function public.marketing_campaigns_lock() from public, anon, authenticated;
