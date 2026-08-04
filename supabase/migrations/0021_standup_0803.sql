-- =============================================================================
-- Live-En-Synergy — 3 Aug standup batch
--
-- Covers, in order:
--   1. audience_members  — gender (with self-describe) + country of residence
--   2. profiles          — records the terms agreement accepted at sign-up
--   3. phone uniqueness  — one number, one account, across all four role tables
--   4. references        — short sequential refs (SPE-00001) instead of hex
--   5. budgets           — remaining budget is net of the platform fee inc VAT
--   6. profiles RLS      — a sponsorship's parties can see participant names
--
-- Additive: new nullable-or-defaulted columns, new indexes, new functions and
-- one new permissive policy. Nothing is dropped or retyped. The reference
-- backfill (4) and the budget recompute (5) do rewrite existing rows — both
-- are described in detail at their step.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. audience_members — richer profile data collection
--
-- `gender` holds the picked option; when that option is "Prefer to
-- self-describe" the free text lands in `gender_self_describe`. Kept as two
-- columns rather than one so the standard options stay filterable/aggregatable
-- without having to pattern match free text.
-- ---------------------------------------------------------------------------
alter table audience_members
  add column if not exists gender               text,
  add column if not exists gender_self_describe text,
  add column if not exists country_of_residence text;


-- ---------------------------------------------------------------------------
-- 2. profiles — terms & conditions acceptance
--
-- The agreement is worded per party (audience / brand / artist), so record
-- which variant was shown alongside when it was accepted.
--
-- The value is collected on the sign-up form and passed through
-- `auth.users.raw_user_meta_data`, because with email confirmation switched on
-- there is no session immediately after sign-up for the app to write with —
-- hence handle_new_user() picking it up rather than application code.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version     text;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, role, full_name, email, terms_accepted_at, terms_version
  )
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'audience'),
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    -- Sent as an ISO string by the sign-up action; null for anything created
    -- outside the sign-up form (e.g. a user invited from the Supabase console).
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    new.raw_user_meta_data ->> 'terms_version'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. Phone uniqueness — one number, one account
--
-- Numbers are stored inconsistently across the four role tables: audience
-- members keep the dialling code in its own column, everyone else types the
-- whole thing into one field, with or without a country code or a national
-- trunk zero. `phone_digits()` reduces all of those to a comparable key by
-- taking the last 10 digits, which is exactly the UK national significant
-- number ("+44 7700 900123", "07700900123" and "7700900123" all collapse to
-- "7700900123").
--
-- IMMUTABLE so it can be used in the indexes below.
-- ---------------------------------------------------------------------------
create or replace function phone_digits(p text)
returns text
language sql
immutable
as $$
  select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10);
$$;

-- Cross-table check for the sign-up / onboarding forms. `security definer`
-- because the caller is a normal user who cannot read other people's rows —
-- it answers "is this taken?" without exposing whose it is.
create or replace function phone_in_use(p_phone text, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when phone_digits(p_phone) = '' then false
    else exists (
      select 1 from public.audience_members a
       where a.profile_id is distinct from p_profile_id
         and a.phone is not null
         and phone_digits(coalesce(a.phone_country_code, '') || a.phone)
             = phone_digits(p_phone)
      union all
      select 1 from public.artists ar
       where ar.profile_id is distinct from p_profile_id
         and ar.contact_phone is not null
         and phone_digits(ar.contact_phone) = phone_digits(p_phone)
      union all
      select 1 from public.event_organisers eo
       where eo.profile_id is distinct from p_profile_id
         and eo.contact_phone is not null
         and phone_digits(eo.contact_phone) = phone_digits(p_phone)
      union all
      select 1 from public.brands b
       where b.profile_id is distinct from p_profile_id
         and b.manager_phone is not null
         and phone_digits(b.manager_phone) = phone_digits(p_phone)
    )
  end;
$$;

grant execute on function phone_in_use(text, uuid) to authenticated, anon;

-- Per-table unique indexes as the backstop against a race between two
-- concurrent saves. Wrapped so that a database which already holds duplicate
-- numbers (QA accounts sharing a test number, say) reports them instead of
-- failing the whole migration — the application-level check still applies, and
-- the index can be added by hand once the duplicates are cleaned up.
do $$
declare
  stmt record;
begin
  for stmt in
    select * from (values
      ('audience_members_phone_key',
       $q$create unique index audience_members_phone_key on audience_members
           (phone_digits(coalesce(phone_country_code, '') || phone))
           where phone is not null and btrim(phone) <> ''$q$),
      ('artists_contact_phone_key',
       $q$create unique index artists_contact_phone_key on artists
           (phone_digits(contact_phone))
           where contact_phone is not null and btrim(contact_phone) <> ''$q$),
      ('event_organisers_contact_phone_key',
       $q$create unique index event_organisers_contact_phone_key on event_organisers
           (phone_digits(contact_phone))
           where contact_phone is not null and btrim(contact_phone) <> ''$q$),
      ('brands_manager_phone_key',
       $q$create unique index brands_manager_phone_key on brands
           (phone_digits(manager_phone))
           where manager_phone is not null and btrim(manager_phone) <> ''$q$)
    ) as t(name, ddl)
  loop
    if to_regclass('public.' || stmt.name) is not null then
      continue;
    end if;
    begin
      execute stmt.ddl;
    exception when unique_violation then
      raise notice
        'Skipped %: the table already holds duplicate phone numbers. Resolve them, then create the index by hand.',
        stmt.name;
    end;
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 4. Short sequential reference numbers
--
-- References were 8 random hex characters ("SPE-3F9A1C0B") — unique, but
-- unreadable over the phone and impossible to order. They become
-- "SPE-00001", numbered in creation order.
--
-- Existing rows are renumbered. References are display-only (every link and
-- foreign key uses the uuid id), so nothing breaks; anyone quoting an old hex
-- reference can still be found by searching, and this is far cheaper to do now
-- than after launch.
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('campaigns',        'CMP', 'campaign_reference_seq'),
      ('event_listings',   'EVT', 'event_listing_reference_seq'),
      ('sponsored_events', 'SPE', 'sponsored_event_reference_seq'),
      ('feedback_reports', 'FB',  'feedback_report_reference_seq')
    ) as v(tbl, prefix, seq)
  loop
    execute format('create sequence if not exists %I', t.seq);

    execute format($f$
      with ordered as (
        select id, row_number() over (order by created_at, id) as rn
          from %1$I
      )
      update %1$I x
         set reference = %2$L || '-' || lpad(o.rn::text, 5, '0')
        from ordered o
       where o.id = x.id
    $f$, t.tbl, t.prefix);

    execute format(
      'select setval(%L, coalesce((select count(*) from %I), 0) + 1, false)',
      t.seq, t.tbl);

    execute format(
      'alter table %I alter column reference set default (%L || ''-'' || lpad(nextval(%L)::text, 5, ''0''))',
      t.tbl, t.prefix, t.seq);
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- 5. Remaining budget is net of the platform fee
--
-- `remaining_budget_gbp` was seeded with the *gross* budget, so every screen
-- quoting "remaining" (and "people this can sponsor") overstated what is
-- actually available by the whole service fee. The fee model lives in
-- src/lib/constants.ts: the greater of £315 or 9% of the gross, plus 20% VAT.
--
-- Recomputed here as gross − fee inc VAT − rewards already released, so a
-- part-spent event keeps its correct drawdown rather than being reset.
-- ---------------------------------------------------------------------------
update sponsored_events se
   set remaining_budget_gbp = greatest(
     0,
     se.budget_gbp
       - round(greatest(315, se.budget_gbp * 0.09) * 1.2, 2)
       - coalesce((
           select sum(p.reward_amount_gbp)
             from participations p
            where p.sponsored_event_id = se.id
              and p.reward_amount_gbp is not null
         ), 0)
   )
 where se.budget_gbp is not null;


-- ---------------------------------------------------------------------------
-- 6. profiles RLS — the parties to a sponsorship can see their participants
--
-- The organiser-side participant list could only ever show "Participant
-- #3f9a1c0b", because profiles are readable by their owner and admins only.
-- The brand and artist running an event need the names of the people they are
-- selecting and verifying (3 Aug standup).
--
-- `security definer` so the policy doesn't recurse through the RLS on
-- participations / sponsored_events, mirroring is_sponsored_event_party()
-- from 0004. Added as a second permissive policy — SELECT policies OR
-- together — rather than editing the existing one.
-- ---------------------------------------------------------------------------
create or replace function is_my_event_participant(p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.participations p
      join public.sponsored_events se on se.id = p.sponsored_event_id
     where p.audience_profile_id = p_profile_id
       and (
         se.artist_profile_id = auth.uid()
         or exists (
           select 1 from public.brands b
            where b.id = se.brand_id and b.profile_id = auth.uid()
         )
       )
  );
$$;

drop policy if exists "profiles: read my event participants" on profiles;
create policy "profiles: read my event participants"
  on profiles for select
  using (is_my_event_participant(id));


-- ---------------------------------------------------------------------------
-- 7. Settling a campaign when one of its suggestions is accepted
--
-- A campaign can carry several suggested events. The moment both parties agree
-- one, the campaign closes, records which listing won, withdraws the sibling
-- proposals, and puts their listings back on the market.
--
-- This has to be `security definer`, and that is the whole point: the person
-- who clicks the final "I agree" is a party to *their* event only. Under
-- normal RLS they can't update the campaign row (owned by the brand) or the
-- sibling sponsorships (owned by other artists), so those updates would match
-- zero rows and fail silently — the same trap 0004 was written to fix.
-- Authorisation is therefore checked explicitly on the way in.
--
-- Returns the withdrawn proposals so the caller can notify their owners.
-- ---------------------------------------------------------------------------
create or replace function close_campaign_on_acceptance(
  p_campaign_id     uuid,
  p_winning_event_id uuid
)
returns table (event_id uuid, event_name text, artist_profile_id uuid)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT parameters share names with columns in the query below; prefer the
-- column in any ambiguous reference rather than silently reading the variable.
#variable_conflict use_column
declare
  v_listing uuid;
begin
  if not (is_admin() or is_sponsored_event_party(p_winning_event_id)) then
    return;
  end if;

  select se.listing_id into v_listing
    from sponsored_events se
   where se.id = p_winning_event_id;

  update campaigns c
     set status = 'closed',
         matched_listing_id = coalesce(v_listing, c.matched_listing_id)
   where c.id = p_campaign_id;

  -- Data-modifying CTEs always run to completion, so `freed` releases the
  -- losing listings even though the outer select doesn't read from it.
  return query
  with losers as (
    update sponsored_events se
       set status = 'withdrawn'
     where se.campaign_id = p_campaign_id
       and se.id <> p_winning_event_id
       and se.status = 'in_progress'
    returning se.id, se.name, se.artist_profile_id, se.listing_id
  ),
  freed as (
    update event_listings el
       set status = 'available'
     where el.id in (
             select l.listing_id from losers l where l.listing_id is not null
           )
       and (v_listing is null or el.id <> v_listing)
    returning el.id
  )
  select l.id, l.name, l.artist_profile_id from losers l;
end;
$$;

grant execute on function close_campaign_on_acceptance(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- 8. feedback_reports — link to the GitHub issue raised for a report
--
-- Beta testers report through the in-app widget; each report is mirrored to a
-- GitHub issue so it lands in the same place as the rest of the work (3 Aug
-- standup). Null when the mirror isn't configured or the API call failed —
-- the report itself is never blocked on GitHub being reachable.
-- ---------------------------------------------------------------------------
alter table feedback_reports
  add column if not exists github_issue_url    text,
  add column if not exists github_issue_number integer;


-- ---------------------------------------------------------------------------
-- 9. Notification event for a withdrawn proposal
--
-- When a campaign's other suggestion is accepted, the losing proposals are
-- withdrawn — the artist waiting on one deserves to be told. `notify()`
-- no-ops on an unseeded key, so the catalogue entry, the settings row and the
-- starter templates all have to land together (same three-step insert as 0006
-- and 0008).
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('sponsorship.withdrawn',
   'Sponsorship proposal withdrawn',
   'The sponsor chose a different event for this campaign, so this proposal has closed.',
   'artist',
   'The artist / organiser',
   '{user_name,event_name}',
   270)
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
