-- =============================================================================
-- Live-En-Synergy — discount code configuration (25 Sep standup)
--
-- 0027 gave each reward tier a code type and a label, and every issued code
-- was a bare `RWD-` + 8 hex chars. The 25 Sep standup asked for:
--
--   1. Codes a participant can't reverse-engineer, optionally carrying the
--      brand's name ("first four or five letters of the brand name" + a random
--      alphanumeric tail).
--   2. The three patterns in "Discount Codes — How We're Planning to Build
--      This" (25 Sep), which mirror Eventbrite's own two building blocks:
--        shared, no cap  (A) — everyone who qualifies gets the same code
--        shared, capped  (B) — same, limited to the tier's participant_cap
--                              ("usable by the first 75 people")
--        unique          (C) — one code per person, assigned from a pool
--      The pool for (C) is filled one of three ways: the admin pastes/uploads
--      the batch they created on the brand's platform (Phase 1 of the plan);
--      the platform generates prefix + random codes for the artist to
--      download and load into their ticketing platform; or the artist
--      uploads their own codes with an optional identification number each.
--      A code is only ever handed out from what's configured here — never
--      invented at issue time — because it has to work on someone else's
--      system.
--   3. Where the code is redeemed — Eventbrite, Ticketmaster, StubHub,
--      Shopify, … — as information only; no platform API is called (Phase 2).
--   4. Admin may edit the configuration only until the artist has reviewed it
--      and consented. After that the tiers and the code pool are frozen until
--      an admin reopens it (which withdraws the consent).
--
-- Additive: new nullable/defaulted columns, one new table, one RPC. The single
-- non-additive change is replacing reward_codes' global unique(code) with a
-- partial per-event unique index that exempts shared codes — a shared code
-- is, by definition, the same string on many rows.
-- =============================================================================

-- --- Tier configuration --------------------------------------------------------

alter table sponsored_event_reward_tiers
  add column if not exists distribution_model text not null default 'unique'
    check (distribution_model in ('shared', 'unique')),
  -- Upper-case letters/digits only, so the code survives any ticketing
  -- platform's own validation. Null = no prefix.
  add column if not exists code_prefix text
    check (code_prefix is null or code_prefix ~ '^[A-Z0-9]{2,8}$'),
  add column if not exists code_random_length integer not null default 8
    check (code_random_length between 6 and 16),
  add column if not exists shared_code text
    check (shared_code is null or shared_code ~ '^[A-Za-z0-9_-]{3,40}$'),
  -- A percentage off the ticket (value_gbp is the fixed-£ alternative 0027
  -- already carried). Both null on a merch tier.
  add column if not exists discount_percent numeric(5, 2)
    check (discount_percent is null or (discount_percent > 0 and discount_percent <= 100)),
  add column if not exists redemption_platform text
    check (redemption_platform is null or redemption_platform in
      ('eventbrite', 'ticketmaster', 'stubhub', 'shopify', 'dice', 'see_tickets', 'skiddle', 'brand_site', 'other')),
  add column if not exists redemption_url text,
  add column if not exists redemption_instructions text,
  add column if not exists valid_until date;

-- --- Artist consent --------------------------------------------------------

alter table sponsored_events
  add column if not exists reward_codes_confirmed_at timestamptz,
  add column if not exists reward_codes_confirmed_by uuid references profiles (id) on delete set null;

-- --- Issued codes: snapshot the redemption details -------------------------

alter table reward_codes
  add column if not exists is_shared boolean not null default false,
  add column if not exists external_ref text,
  add column if not exists redemption_platform text,
  add column if not exists redemption_url text,
  add column if not exists redemption_instructions text;

alter table reward_codes drop constraint if exists reward_codes_code_key;
-- Scoped per event rather than global: codes uploaded from two different
-- brands' platforms can legitimately share a string.
create unique index if not exists reward_codes_code_unique
  on reward_codes (sponsored_event_id, code) where not is_shared;
-- One code per participant per event — the admin UI already hides the
-- "Issue code" button once someone has one; this makes it true under a
-- double-submit too. Void codes don't count, so a voided code can be reissued.
create unique index if not exists reward_codes_one_live_per_participation
  on reward_codes (participation_id)
  where participation_id is not null and status <> 'void';

-- --- Code pool -------------------------------------------------------------
-- Pattern (C)'s codes, which exist before anyone has earned them: a
-- platform-generated batch (for the artist to download and load into their
-- ticketing platform) or an uploaded batch (created by the admin on the
-- brand's platform, or supplied by the artist). issueRewardCode() takes the
-- oldest unassigned one.

create table if not exists reward_code_pool (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references sponsored_events (id) on delete cascade,
  tier_id            uuid not null references sponsored_event_reward_tiers (id) on delete cascade,
  code               text not null check (code ~ '^[A-Za-z0-9_-]{3,40}$'),
  source             text not null check (source in ('generated', 'uploaded')),
  -- The artist's own identification number for this code, if they have one.
  external_ref       text,
  assigned_code_id   uuid references reward_codes (id) on delete set null,
  assigned_at        timestamptz,
  created_by         uuid references profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (sponsored_event_id, code)
);
create index if not exists reward_code_pool_tier_idx on reward_code_pool (tier_id, created_at);

alter table reward_code_pool enable row level security;

drop policy if exists "reward_code_pool: parties or admin read" on reward_code_pool;
create policy "reward_code_pool: parties or admin read"
  on reward_code_pool for select
  using (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = reward_code_pool.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  );

drop policy if exists "reward_code_pool: admin manage" on reward_code_pool;
create policy "reward_code_pool: admin manage"
  on reward_code_pool for all
  using (is_admin())
  with check (is_admin());

-- The artist may add and remove their *own* uploaded codes on a unique tier,
-- only before they've consented (the freeze trigger below re-checks that).
drop policy if exists "reward_code_pool: artist supplies" on reward_code_pool;
create policy "reward_code_pool: artist supplies"
  on reward_code_pool for insert
  with check (
    source = 'uploaded'
    and assigned_code_id is null
    and created_by = auth.uid()
    and exists (
      select 1 from sponsored_events se
      join sponsored_event_reward_tiers t on t.sponsored_event_id = se.id
      where se.id = reward_code_pool.sponsored_event_id
        and t.id = reward_code_pool.tier_id
        and t.distribution_model = 'unique'
        and se.artist_profile_id = auth.uid()
    )
  );

drop policy if exists "reward_code_pool: artist removes unassigned" on reward_code_pool;
create policy "reward_code_pool: artist removes unassigned"
  on reward_code_pool for delete
  using (
    source = 'uploaded'
    and assigned_at is null
    and created_by = auth.uid()
    and exists (
      select 1 from sponsored_events se
      where se.id = reward_code_pool.sponsored_event_id
        and se.artist_profile_id = auth.uid()
    )
  );

-- --- Freeze after consent ----------------------------------------------------
-- Enforced in the database as well as the actions, because the artist writes
-- to reward_code_pool directly under the policies above.

create or replace function reward_config_frozen(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select reward_codes_confirmed_at is not null from sponsored_events where id = p_event_id),
    false
  );
$$;

create or replace function guard_reward_tier_freeze()
returns trigger
language plpgsql
as $$
begin
  if reward_config_frozen(coalesce(new.sponsored_event_id, old.sponsored_event_id)) then
    raise exception 'Discount codes for this sponsorship are confirmed by the artist — reopen them before editing.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sponsored_event_reward_tiers_freeze on sponsored_event_reward_tiers;
create trigger sponsored_event_reward_tiers_freeze
  before insert or update or delete on sponsored_event_reward_tiers
  for each row execute function guard_reward_tier_freeze();

create or replace function guard_reward_pool_freeze()
returns trigger
language plpgsql
as $$
begin
  -- Assigning a pooled code to a participant is the point of the pool and
  -- happens after consent; only the assignment columns may change then.
  if tg_op = 'UPDATE'
     and new.code = old.code
     and new.tier_id = old.tier_id
     and new.source = old.source
     and new.external_ref is not distinct from old.external_ref then
    return new;
  end if;
  if reward_config_frozen(coalesce(new.sponsored_event_id, old.sponsored_event_id)) then
    raise exception 'Discount codes for this sponsorship are confirmed by the artist — reopen them before editing.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reward_code_pool_freeze on reward_code_pool;
create trigger reward_code_pool_freeze
  before insert or update or delete on reward_code_pool
  for each row execute function guard_reward_pool_freeze();

-- --- Artist consent RPC -------------------------------------------------------
-- security definer: the artist has no column-scoped UPDATE on sponsored_events,
-- and a row policy can't limit them to these two columns.

create or replace function confirm_reward_codes(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event sponsored_events%rowtype;
  v_tier  record;
  v_pool  int;
begin
  select * into v_event from sponsored_events where id = p_event_id for update;
  if not found or v_event.artist_profile_id is distinct from auth.uid() then
    return 'forbidden';
  end if;
  if v_event.reward_codes_confirmed_at is not null then
    return 'already_confirmed';
  end if;
  if not exists (select 1 from sponsored_event_reward_tiers where sponsored_event_id = p_event_id) then
    return 'no_tiers';
  end if;

  -- A unique tier with an empty pool, or a shared tier with no code, can't
  -- pay out — don't let the artist consent to it.
  for v_tier in
    select * from sponsored_event_reward_tiers where sponsored_event_id = p_event_id
  loop
    if v_tier.distribution_model = 'shared' and v_tier.shared_code is null then
      return 'shared_code_missing';
    end if;
    if v_tier.distribution_model = 'unique' then
      select count(*) into v_pool from reward_code_pool where tier_id = v_tier.id;
      if v_pool = 0 then
        return 'pool_empty';
      end if;
    end if;
  end loop;

  update sponsored_events
     set reward_codes_confirmed_at = now(),
         reward_codes_confirmed_by = auth.uid()
   where id = p_event_id;
  return 'confirmed';
end;
$$;

grant execute on function confirm_reward_codes(uuid) to authenticated;

-- --- Notification events --------------------------------------------------------

insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('reward.codes_ready_for_review','Discount codes ready for review','The team has set up discount codes for your sponsored event — review and confirm them.','artist','The artist / organiser','{user_name,event_name,reference}',439),
  ('admin.reward_codes_confirmed','Discount codes confirmed','The artist confirmed the discount-code setup for a sponsored event.','admin','The admin team','{event_name,reference}',440)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body)
select e.key, 'in_app', e.name, coalesce(e.description, e.name)
from notification_events e
where not exists (
  select 1 from notification_templates t
  where t.event_key = e.key and t.channel = 'in_app'
);

insert into notification_templates (event_key, channel, subject, body)
select e.key,
       'email',
       e.name || ' · Live·En·Synergy',
       'Hi {{user_name}},' || chr(10) || chr(10) ||
       coalesce(e.description, e.name) || chr(10) || chr(10) ||
       '— The Live·En·Synergy team'
from notification_events e
where not exists (
  select 1 from notification_templates t
  where t.event_key = e.key and t.channel = 'email'
);
