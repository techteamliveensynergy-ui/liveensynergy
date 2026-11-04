-- =============================================================================
-- 0103 — the artist fulfilment form, and "live" meaning fulfilled (GitHub #57,
-- #59; 2 Nov standup).
--
-- Until now an event was public the moment its sponsorship was confirmed and
-- its campaign paid. The 2 Nov standup notes say events should go live
-- AUTOMATICALLY WHEN THE ARTIST COMPLETES THE FULFILMENT FORM — the 2 Nov test
-- showed them going live straight away. This migration adds the form's state
-- and makes it the go-live gate.
--
-- 1. sponsored_event_fulfilment — one row per confirmed sponsorship, in its own
--    table rather than columns on sponsored_events. The 0061 guard lists the
--    sponsored_events columns an untrusted writer may not touch BY NAME, so a
--    new column there would have let an artist write their own "complete" flag
--    and publish their event. Here only admins write (RLS), the artist's two
--    steps go through definer RPCs, and nobody else can set completed_at.
--      - admin-authored content the artist reads: promotional commitments
--        (several channel names, post count, URLs, start date, post texts,
--        other requirements), special terms, social-proof requirements and the
--        payment terms;
--      - the artist's consents (promotional commitments; final T&C + Privacy);
--      - the state: completed_at / completion_kind / waived_reason.
--    A row is created by a trigger when a sponsorship becomes confirmed, so a
--    new event starts "waiting for fulfilment" without anyone remembering to
--    set it up.
--
-- 2. artist_invoices — the invoice the artist uploads (PDF or image, private
--    bucket). History is never overwritten: no update/delete grant for the
--    artist, none for anyone on delete (financial record, 6-year retention,
--    #38). Payment details travel INSIDE the invoice file — no bank fields in
--    our database. Admin marks each received / paid / rejected. The brand never
--    reads these.
--
-- 3. The go-live gate. sponsored_event_fulfilled(id) is the one rule. It now
--    also decides:
--      - sponsored_event_is_public() / public_live_events()  (the public page
--        and the "Live now" cards),
--      - the "sponsored_events: public read confirmed" policy (so the audience
--        dashboard doesn't list an unfulfilled event either),
--      - participations_require_open() (the registration backstop, same
--        REGISTRATION_NOT_OPEN text the UI already handles).
--    Parties and admins read through the other policy and are unaffected.
--
-- 4. BACKFILL (L4 in lessons.md): every confirmed/completed event that exists
--    today is marked fulfilled ('predates'), otherwise applying this would take
--    every live event offline. Only events confirmed from now on wait.
--
-- 5. Consent log: two new types, 'promotion_terms' and 'artist_fulfilment_terms',
--    source 'fulfilment', written by a trigger on the fulfilment row (0080's
--    pattern) with a snapshot of what was agreed. A reset (the team edited the
--    terms after the artist ticked) is logged as granted = false.
--
-- 6. event_listings: the "public read available" policy applied to everyone,
--    including signed-out visitors, which is how listings reached the public
--    site. Brands enquire through the team now, so the read is for signed-in
--    users only (brands discovering inside the dashboard are unaffected).
--
-- 7. sponsored_event_proofs.channel — which promotional channel a proof is for.
--
-- Additive except the three CREATE OR REPLACEs and the two policy swaps, which
-- keep their signatures/predicates plus the new condition. Apply BEFORE
-- deploying the code (the pages read the new tables).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The fulfilment row
-- ---------------------------------------------------------------------------
create table if not exists public.sponsored_event_fulfilment (
  sponsored_event_id    uuid primary key references public.sponsored_events (id) on delete cascade,

  -- Promotional commitments (pre-filled by the team; the artist reads them).
  promo_channels        text[] not null default '{}',   -- several names, e.g. "Instagram @act"
  promo_post_count      integer check (promo_post_count is null or promo_post_count between 0 and 1000),
  promo_urls            text[] not null default '{}',
  promo_start_date      date,
  promo_post_texts      text,
  promo_other           text,
  special_terms         text,
  -- Social-media proof the artist must upload afterwards.
  proof_requirements    text,
  proof_min_count       integer check (proof_min_count is null or proof_min_count between 0 and 1000),
  -- Payment terms (wording from the team; defaults come from a template).
  payment_terms         text,

  -- The artist's consents.
  promo_consent_at      timestamptz,
  promo_consent_by      uuid references public.profiles (id) on delete set null,
  -- The four "Promotional confirmations" (Sakshi's doc, 2 Nov), word for word
  -- as the artist saw them, so the record stands on its own.
  promo_consent_statements text[] not null default '{}',
  final_consent_at      timestamptz,
  final_consent_by      uuid references public.profiles (id) on delete set null,
  final_consent_version text,

  -- State. completed_at is what makes the event live.
  requested_at          timestamptz not null default now(),
  completed_at          timestamptz,
  completed_by          uuid references public.profiles (id) on delete set null,
  completion_kind       text check (completion_kind is null or completion_kind in ('artist', 'admin_waived', 'predates')),
  waived_reason         text check (waived_reason is null or length(waived_reason) <= 1000),

  updated_at            timestamptz not null default now(),
  updated_by            uuid references public.profiles (id) on delete set null,

  -- A completed row says how it was completed.
  constraint fulfilment_completion_consistent check (
    (completed_at is null and completion_kind is null)
    or (completed_at is not null and completion_kind is not null)
  )
);

alter table public.sponsored_event_fulfilment enable row level security;

drop policy if exists "fulfilment: admin all" on public.sponsored_event_fulfilment;
create policy "fulfilment: admin all" on public.sponsored_event_fulfilment
  for all using (public.is_admin()) with check (public.is_admin());

-- The event's artist reads their own form. The brand does not: it carries the
-- artist's payment terms.
drop policy if exists "fulfilment: artist read" on public.sponsored_event_fulfilment;
create policy "fulfilment: artist read" on public.sponsored_event_fulfilment
  for select using (
    exists (
      select 1 from public.sponsored_events se
       where se.id = sponsored_event_fulfilment.sponsored_event_id
         and se.artist_profile_id = auth.uid()
    )
  );

-- Writes are admin-only by the policies above. Supabase's default privileges
-- would otherwise hand out DELETE too, so take it (and everything from anon)
-- away explicitly: the row is evidence of what was agreed.
grant select, insert, update on public.sponsored_event_fulfilment to authenticated;
revoke all on public.sponsored_event_fulfilment from anon;
revoke delete on public.sponsored_event_fulfilment from authenticated;

drop trigger if exists sponsored_event_fulfilment_set_updated_at on public.sponsored_event_fulfilment;
create trigger sponsored_event_fulfilment_set_updated_at
  before update on public.sponsored_event_fulfilment
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The rule, in one place.
-- ---------------------------------------------------------------------------
create or replace function public.sponsored_event_fulfilled(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sponsored_event_fulfilment f
     where f.sponsored_event_id = p_id and f.completed_at is not null
  )
$$;
revoke all on function public.sponsored_event_fulfilled(uuid) from public;
grant execute on function public.sponsored_event_fulfilled(uuid) to anon, authenticated, service_role;

-- Does the form carry any promotional commitment for the artist to agree to?
create or replace function public.fulfilment_has_promo(f public.sponsored_event_fulfilment)
returns boolean
language sql
immutable
as $$
  select coalesce(cardinality(f.promo_channels), 0) > 0
      or f.promo_post_count is not null
      or coalesce(cardinality(f.promo_urls), 0) > 0
      or f.promo_start_date is not null
      or nullif(btrim(coalesce(f.promo_post_texts, '')), '') is not null
      or nullif(btrim(coalesce(f.promo_other, '')), '') is not null
      or nullif(btrim(coalesce(f.special_terms, '')), '') is not null
      or nullif(btrim(coalesce(f.proof_requirements, '')), '') is not null
      or f.proof_min_count is not null
$$;

-- ---------------------------------------------------------------------------
-- A new confirmed sponsorship starts waiting for fulfilment.
-- ---------------------------------------------------------------------------
create or replace function public.sponsored_events_fulfilment_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' then
    insert into public.sponsored_event_fulfilment (sponsored_event_id)
    values (new.id)
    on conflict (sponsored_event_id) do nothing;
  elsif new.status = 'completed' then
    -- Completed with no form (an admin closed it out): don't hide an event
    -- people may already be registered for.
    insert into public.sponsored_event_fulfilment
      (sponsored_event_id, completed_at, completion_kind, waived_reason)
    values (new.id, now(), 'predates', 'Completed without a fulfilment form')
    on conflict (sponsored_event_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sponsored_events_fulfilment_row on public.sponsored_events;
create trigger sponsored_events_fulfilment_row
  after insert or update of status on public.sponsored_events
  for each row execute function public.sponsored_events_fulfilment_row();

-- ---------------------------------------------------------------------------
-- When the team edits the terms after the artist agreed, the agreement
-- resets — the artist confirms the version they've actually read. A change to
-- the promotional commitments (or proof requirements) clears both consents; a
-- change to the payment terms clears the final one. A live event stays live:
-- the team reopens it by hand if it should not be.
-- ---------------------------------------------------------------------------
create or replace function public.fulfilment_reset_consent()
returns trigger
language plpgsql
as $$
declare
  v_promo_changed boolean;
  v_pay_changed boolean;
begin
  v_promo_changed :=
       new.promo_channels     is distinct from old.promo_channels
    or new.promo_post_count   is distinct from old.promo_post_count
    or new.promo_urls         is distinct from old.promo_urls
    or new.promo_start_date   is distinct from old.promo_start_date
    or new.promo_post_texts   is distinct from old.promo_post_texts
    or new.promo_other        is distinct from old.promo_other
    or new.special_terms      is distinct from old.special_terms
    or new.proof_requirements is distinct from old.proof_requirements
    or new.proof_min_count    is distinct from old.proof_min_count;
  v_pay_changed := new.payment_terms is distinct from old.payment_terms;

  if v_promo_changed and (old.promo_consent_at is not null or old.final_consent_at is not null) then
    new.promo_consent_at := null;
    new.promo_consent_by := null;
    new.promo_consent_statements := '{}';
    new.final_consent_at := null;
    new.final_consent_by := null;
    new.final_consent_version := null;
  elsif v_pay_changed and old.final_consent_at is not null then
    new.final_consent_at := null;
    new.final_consent_by := null;
    new.final_consent_version := null;
  end if;
  return new;
end;
$$;

drop trigger if exists fulfilment_reset_consent on public.sponsored_event_fulfilment;
create trigger fulfilment_reset_consent
  before update on public.sponsored_event_fulfilment
  for each row execute function public.fulfilment_reset_consent();

-- ---------------------------------------------------------------------------
-- 5. Consent log
-- ---------------------------------------------------------------------------
alter table public.consent_records drop constraint if exists consent_records_consent_type_check;
alter table public.consent_records add constraint consent_records_consent_type_check check (consent_type in (
  'platform_terms', 'privacy_policy', 'email_verified', 'event_terms', 'sponsor_marketing',
  'survey_terms', 'residency_confirmed', 'order_form_details', 'order_form_terms',
  'promotion_terms',           -- artist agreed the promotional commitments
  'artist_fulfilment_terms'    -- artist's final T&C + Privacy Policy consent
));
alter table public.consent_records drop constraint if exists consent_records_source_check;
alter table public.consent_records add constraint consent_records_source_check check (source in (
  'sign_up', 'survey_sign_up', 'verify_link', 'event_registration',
  'my_events', 'public_survey', 'dashboard_survey', 'order_form', 'fulfilment'
));

create or replace function public.consent_from_fulfilment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_email text;
  v_ctx jsonb;
begin
  begin
    select se.reference into v_ref from public.sponsored_events se where se.id = new.sponsored_event_id;
    v_ctx := jsonb_build_object('sponsored_event_id', new.sponsored_event_id, 'reference', v_ref);

    if new.promo_consent_at is distinct from old.promo_consent_at then
      select p.email into v_email from public.profiles p where p.id = coalesce(new.promo_consent_by, old.promo_consent_by);
      insert into public.consent_records (profile_id, subject_email, consent_type, granted, version, source, context, recorded_at)
      values (
        coalesce(new.promo_consent_by, old.promo_consent_by), v_email, 'promotion_terms',
        new.promo_consent_at is not null, null, 'fulfilment',
        -- What was agreed, word for word, so the record stands on its own.
        v_ctx || case when new.promo_consent_at is not null then jsonb_build_object('terms', jsonb_build_object(
            'channels', new.promo_channels, 'post_count', new.promo_post_count, 'urls', new.promo_urls,
            'start_date', new.promo_start_date, 'post_texts', new.promo_post_texts, 'other', new.promo_other,
            'special_terms', new.special_terms, 'proof_requirements', new.proof_requirements,
            'proof_min_count', new.proof_min_count),
            'confirmations', new.promo_consent_statements)
          else jsonb_build_object('reason', 'terms_changed_or_reopened') end,
        coalesce(new.promo_consent_at, now()));
    end if;

    if new.final_consent_at is distinct from old.final_consent_at then
      select p.email into v_email from public.profiles p where p.id = coalesce(new.final_consent_by, old.final_consent_by);
      insert into public.consent_records (profile_id, subject_email, consent_type, granted, version, source, context, recorded_at)
      values (
        coalesce(new.final_consent_by, old.final_consent_by), v_email, 'artist_fulfilment_terms',
        new.final_consent_at is not null,
        coalesce(new.final_consent_version, old.final_consent_version), 'fulfilment',
        v_ctx || case when new.final_consent_at is not null
          then jsonb_build_object('payment_terms', new.payment_terms)
          else jsonb_build_object('reason', 'terms_changed_or_reopened') end,
        coalesce(new.final_consent_at, now()));
    end if;
  exception when others then
    -- A consent record failing must never fail the fulfilment itself.
    raise warning 'consent_from_fulfilment (%): %', new.sponsored_event_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists sponsored_event_fulfilment_consent_records on public.sponsored_event_fulfilment;
create trigger sponsored_event_fulfilment_consent_records
  after update on public.sponsored_event_fulfilment
  for each row execute function public.consent_from_fulfilment();

-- ---------------------------------------------------------------------------
-- The artist's two steps, and the team's two overrides.
-- ---------------------------------------------------------------------------

-- Step 1 — agree the promotional commitments.
create or replace function public.confirm_promotion_terms(p_event_id uuid, p_statements text[])
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event sponsored_events%rowtype;
  v_f     sponsored_event_fulfilment%rowtype;
begin
  select * into v_event from sponsored_events where id = p_event_id;
  if not found or v_event.artist_profile_id is distinct from auth.uid() then
    return 'forbidden';
  end if;
  select * into v_f from sponsored_event_fulfilment where sponsored_event_id = p_event_id for update;
  if not found then
    return 'not_ready';
  end if;
  if not public.fulfilment_has_promo(v_f) then
    return 'nothing_to_confirm';
  end if;
  if v_f.promo_consent_at is not null then
    return 'already_confirmed';
  end if;
  -- All four confirmations, ticked. The wording lives in the app
  -- (src/lib/fulfilment.ts); the database only insists none were skipped.
  if coalesce(cardinality(p_statements), 0) < 4 then
    return 'statements_required';
  end if;
  update sponsored_event_fulfilment
     set promo_consent_at = now(), promo_consent_by = auth.uid(),
         promo_consent_statements = p_statements
   where sponsored_event_id = p_event_id;
  return 'confirmed';
end;
$$;
revoke all on function public.confirm_promotion_terms(uuid, text[]) from public, anon;
grant execute on function public.confirm_promotion_terms(uuid, text[]) to authenticated;

-- Step 2 — final consent, and the event goes live. Every refusal is a short
-- code the action turns into a sentence.
create or replace function public.submit_artist_fulfilment(p_event_id uuid, p_terms_version text, p_consent boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event sponsored_events%rowtype;
  v_f     sponsored_event_fulfilment%rowtype;
  v_invoice_needed boolean;
begin
  select * into v_event from sponsored_events where id = p_event_id;
  if not found or v_event.artist_profile_id is distinct from auth.uid() then
    return 'forbidden';
  end if;
  if v_event.status <> 'confirmed' then
    return 'not_confirmed';
  end if;
  select * into v_f from sponsored_event_fulfilment where sponsored_event_id = p_event_id for update;
  if not found then
    return 'not_ready';
  end if;
  if not coalesce(p_consent, false) then
    return 'consent_required';
  end if;

  -- Discount codes: set up and confirmed (0045). With no tier there is
  -- nothing to confirm, and an event with no reward must not go live.
  if v_event.reward_codes_confirmed_at is null
     or not exists (select 1 from sponsored_event_reward_tiers where sponsored_event_id = p_event_id) then
    return 'codes_unconfirmed';
  end if;

  if public.fulfilment_has_promo(v_f) and v_f.promo_consent_at is null then
    return 'promo_unconfirmed';
  end if;

  -- An invoice is needed once there is something to be paid: a fee on the
  -- event, or payment terms the team has written.
  v_invoice_needed := coalesce(v_event.artist_fee_gbp, 0) > 0
                      or nullif(btrim(coalesce(v_f.payment_terms, '')), '') is not null;
  if v_invoice_needed
     and not exists (select 1 from artist_invoices i
                      where i.sponsored_event_id = p_event_id and i.status <> 'rejected') then
    return 'invoice_missing';
  end if;

  update sponsored_event_fulfilment
     set final_consent_at = now(),
         final_consent_by = auth.uid(),
         final_consent_version = left(coalesce(p_terms_version, ''), 40),
         completed_at = coalesce(completed_at, now()),
         completed_by = coalesce(completed_by, auth.uid()),
         completion_kind = coalesce(completion_kind, 'artist')
   where sponsored_event_id = p_event_id;

  -- Idempotent: an artist re-confirming after the team changed the terms on an
  -- already-live event only re-records consent.
  return case when v_f.completed_at is null then 'submitted' else 're_confirmed' end;
end;
$$;
revoke all on function public.submit_artist_fulfilment(uuid, text, boolean) from public, anon;
grant execute on function public.submit_artist_fulfilment(uuid, text, boolean) to authenticated;

-- Team override: put an event live without the artist's form (a written
-- reason), or take it back to "waiting for fulfilment".
create or replace function public.admin_set_fulfilment(p_event_id uuid, p_action text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can change fulfilment' using errcode = '42501';
  end if;
  if not exists (select 1 from sponsored_events where id = p_event_id) then
    return 'not_found';
  end if;

  if p_action = 'waive' then
    if v_reason is null or length(v_reason) < 3 then
      return 'reason_required';
    end if;
    insert into sponsored_event_fulfilment (sponsored_event_id, completed_at, completed_by, completion_kind, waived_reason, updated_by)
    values (p_event_id, now(), auth.uid(), 'admin_waived', left(v_reason, 1000), auth.uid())
    on conflict (sponsored_event_id) do update
      set completed_at = coalesce(sponsored_event_fulfilment.completed_at, excluded.completed_at),
          completed_by = coalesce(sponsored_event_fulfilment.completed_by, excluded.completed_by),
          completion_kind = coalesce(sponsored_event_fulfilment.completion_kind, excluded.completion_kind),
          waived_reason = excluded.waived_reason,
          updated_by = auth.uid();
  elsif p_action = 'reopen' then
    -- Back to waiting. The artist's final consent is cleared so they confirm
    -- again (logged as withdrawn); the form content stays.
    update sponsored_event_fulfilment
       set completed_at = null, completed_by = null, completion_kind = null,
           waived_reason = null,
           final_consent_at = null, final_consent_by = null, final_consent_version = null,
           updated_by = auth.uid()
     where sponsored_event_id = p_event_id;
    if not found then
      return 'not_found';
    end if;
  else
    return 'bad_action';
  end if;

  perform public.log_admin_action(
    'fulfilment.' || p_action, 'sponsored_event', p_event_id::text,
    jsonb_build_object('reason', v_reason));
  return 'ok';
end;
$$;
revoke all on function public.admin_set_fulfilment(uuid, text, text) from public, anon;
grant execute on function public.admin_set_fulfilment(uuid, text, text) to authenticated;

-- Which of these confirmed events are still waiting for fulfilment? For the
-- "Waiting for fulfilment" badge on the lists. The brand has no read policy on
-- the fulfilment table (it carries the artist's payment terms), so this
-- answers only that one fact, and only for the caller's own events.
create or replace function public.sponsored_events_waiting_fulfilment(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select se.id
    from public.sponsored_events se
    join public.sponsored_event_fulfilment f on f.sponsored_event_id = se.id
   where se.id = any(p_ids)
     and se.status = 'confirmed'
     and f.completed_at is null
     and (
       public.is_admin()
       or se.artist_profile_id = auth.uid()
       or exists (select 1 from public.brands b where b.id = se.brand_id and b.profile_id = auth.uid())
     )
$$;
revoke all on function public.sponsored_events_waiting_fulfilment(uuid[]) from public, anon;
grant execute on function public.sponsored_events_waiting_fulfilment(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invoices
-- ---------------------------------------------------------------------------
create table if not exists public.artist_invoices (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references public.sponsored_events (id) on delete cascade,
  uploaded_by        uuid references public.profiles (id) on delete set null,
  file_path          text not null,         -- private-uploads path, signed per render
  file_name          text,
  invoice_number     text check (invoice_number is null or length(invoice_number) <= 100),
  amount_gbp         numeric(12, 2) check (amount_gbp is null or amount_gbp >= 0),
  note               text check (note is null or length(note) <= 1000),
  status             text not null default 'submitted'
                       check (status in ('submitted', 'received', 'paid', 'rejected')),
  review_note        text check (review_note is null or length(review_note) <= 1000),
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists artist_invoices_event_idx on public.artist_invoices (sponsored_event_id, created_at desc);

alter table public.artist_invoices enable row level security;

drop policy if exists "artist_invoices: admin all" on public.artist_invoices;
create policy "artist_invoices: admin all" on public.artist_invoices
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "artist_invoices: artist read" on public.artist_invoices;
create policy "artist_invoices: artist read" on public.artist_invoices
  for select using (
    exists (select 1 from public.sponsored_events se
             where se.id = artist_invoices.sponsored_event_id and se.artist_profile_id = auth.uid())
  );

-- The artist can add an invoice for their own event — as 'submitted', never
-- pre-reviewed. They cannot change or remove one: replacing keeps the history.
drop policy if exists "artist_invoices: artist insert" on public.artist_invoices;
create policy "artist_invoices: artist insert" on public.artist_invoices
  for insert with check (
    uploaded_by = auth.uid()
    and status = 'submitted'
    and reviewed_by is null and reviewed_at is null and review_note is null
    and exists (select 1 from public.sponsored_events se
                 where se.id = artist_invoices.sponsored_event_id and se.artist_profile_id = auth.uid())
  );

grant select, insert, update on public.artist_invoices to authenticated;   -- update: admin policy only
-- A financial record (6-year retention, #38): nobody deletes one through the
-- API, admins included. The explicit revoke matters on Supabase, whose default
-- privileges grant DELETE on every new table.
revoke all on public.artist_invoices from anon;
revoke delete on public.artist_invoices from authenticated;

-- ---------------------------------------------------------------------------
-- 3. The gate
-- ---------------------------------------------------------------------------
create or replace function public.sponsored_event_is_public(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.sponsored_events se
      join public.campaigns c on c.id = se.campaign_id
     where se.id = p_id
       and se.status in ('confirmed', 'completed')
       and c.status in ('in_progress', 'completed')
       and public.sponsored_event_fulfilled(se.id)
  )
$$;

create or replace function public.public_live_events()
returns table (
  id uuid, name text, event_date date, start_time time, timezone text,
  venue text, category text, banner_url text,
  artist_name text, brand_name text, brand_logo_url text,
  is_open boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select se.id,
         se.name,
         coalesce(se.event_date, l.event_date),
         coalesce(se.start_time, l.start_time),
         coalesce(se.timezone, l.timezone, 'Europe/London'),
         coalesce(nullif(concat_ws(', ', l.venue_name, l.city), ''), se.location),
         coalesce(l.category, c.category),
         coalesce(se.banner_url, l.image_url, c.image_url),
         coalesce(nullif(se.artist_display_name, ''), a.stage_name, a.artist_name, o.event_name),
         case when bp.id is null then null else b.brand_name end,
         case when bp.id is null then null else b.logo_url end,
         public.campaign_is_open(c.id)
    from public.sponsored_events se
    join public.campaigns c on c.id = se.campaign_id
    left join public.brands b on b.id = se.brand_id
    left join public.profiles bp on bp.id = b.profile_id and bp.is_active
    left join public.event_listings l on l.id = se.listing_id
    left join public.artists a on a.id = l.artist_id
    left join public.event_organisers o on o.id = l.organiser_id
   where se.status = 'confirmed'
     and c.status = 'in_progress'
     and public.sponsored_event_fulfilled(se.id)
     and (coalesce(se.event_date, l.event_date) is null
          or coalesce(se.event_date, l.event_date)
             >= (now() at time zone coalesce(se.timezone, 'Europe/London'))::date)
   order by coalesce(se.event_date, l.event_date) asc nulls last, se.created_at desc
$$;

-- The audience dashboard reads confirmed events through this policy (0002).
-- Parties and admins have their own policy, so this only narrows what a
-- stranger sees: an event that has not completed fulfilment.
drop policy if exists "sponsored_events: public read confirmed" on public.sponsored_events;
create policy "sponsored_events: public read confirmed"
  on public.sponsored_events for select
  using (status in ('confirmed', 'completed') and public.sponsored_event_fulfilled(id));

create or replace function public.participations_require_open()
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
  -- Not live until the artist has completed the fulfilment form (0103). Same
  -- text as the campaign gate: the register actions show "opens soon".
  if not public.sponsored_event_fulfilled(new.sponsored_event_id) then
    raise exception 'REGISTRATION_NOT_OPEN: registration for this event has not opened yet'
      using errcode = 'P0001';
  end if;
  select se.campaign_id into v_campaign
    from public.sponsored_events se where se.id = new.sponsored_event_id;
  if not public.campaign_is_open(v_campaign) then
    raise exception 'REGISTRATION_NOT_OPEN: registration for this event has not opened yet'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Backfill — everything confirmed/completed today stays live.
-- ---------------------------------------------------------------------------
insert into public.sponsored_event_fulfilment
  (sponsored_event_id, completed_at, completion_kind, waived_reason)
select se.id, now(), 'predates', 'Confirmed before the fulfilment form existed'
  from public.sponsored_events se
 where se.status in ('confirmed', 'completed')
on conflict (sponsored_event_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Listings are for signed-in users (brands in the dashboard), not the
--    public site.
-- ---------------------------------------------------------------------------
drop policy if exists "event_listings: public read available" on public.event_listings;
drop policy if exists "event_listings: signed-in read available" on public.event_listings;
create policy "event_listings: signed-in read available"
  on public.event_listings for select to authenticated
  using (status = 'available' or owner_profile_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Which channel a proof is for
-- ---------------------------------------------------------------------------
alter table public.sponsored_event_proofs add column if not exists channel text
  check (channel is null or length(channel) <= 200);

-- ---------------------------------------------------------------------------
-- Notifications (catalogue + settings + templates — notify() no-ops without
-- all three, CLAUDE.md).
-- ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('fulfilment.requested', 'Complete your fulfilment form',
   'A partnership was confirmed — the artist completes the fulfilment form to take the event live.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference}', 237),
  ('fulfilment.terms_updated', 'Promotional terms updated',
   'The team changed the promotional or payment terms — the artist confirms again.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference}', 238),
  ('fulfilment.live', 'Your event is live',
   'The artist completed the fulfilment form and the event is now live.',
   'artist', 'The artist / organiser', '{user_name,event_name,reference}', 239),
  ('admin.fulfilment_submitted', 'Fulfilment form completed',
   'An artist completed the fulfilment form; the event is now live.',
   'admin', 'The admin team', '{user_name,event_name,reference}', 446),
  ('admin.artist_invoice_uploaded', 'Artist invoice uploaded',
   'An artist uploaded an invoice for a partnered event.',
   'admin', 'The admin team', '{user_name,event_name,reference}', 447)
on conflict (key) do nothing;

insert into public.notification_settings (event_key)
select key from public.notification_events
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body) values
  ('fulfilment.requested', 'in_app', 'Complete the fulfilment form for {{event_name}}',
   '{{event_name}} ({{reference}}) is confirmed. Complete the fulfilment form — discount codes, promotional commitments, invoice and final consent — and your event goes live.'),
  ('fulfilment.requested', 'email', 'Complete the fulfilment form for {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{event_name}} ({{reference}}) is confirmed. To take it live, open the partnered event in your dashboard and complete the fulfilment form: confirm the discount codes, review the promotional commitments, upload your invoice and give your final consent. The event goes live as soon as you submit.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('fulfilment.terms_updated', 'in_app', 'Terms updated for {{event_name}} — please confirm again',
   'The team updated the terms for {{event_name}} ({{reference}}). Review them on the event page and confirm again.'),
  ('fulfilment.terms_updated', 'email', 'Terms updated for {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'The team updated the promotional or payment terms for {{event_name}} ({{reference}}). Please review them in your dashboard and confirm again.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('fulfilment.live', 'in_app', '{{event_name}} is live',
   'Thanks — {{event_name}} ({{reference}}) is now live.'),
  ('fulfilment.live', 'email', '{{event_name}} is live · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'Thanks for completing the fulfilment form. {{event_name}} ({{reference}}) is now live.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.fulfilment_submitted', 'in_app', 'Fulfilment completed: {{event_name}} ({{reference}})',
   'The artist completed the fulfilment form for {{event_name}} ({{reference}}). The event is live.'),
  ('admin.fulfilment_submitted', 'email', 'Fulfilment completed: {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'The artist completed the fulfilment form for {{event_name}} ({{reference}}). The event is now live. Their invoice is on the admin event page for review.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.artist_invoice_uploaded', 'in_app', 'Invoice uploaded: {{event_name}} ({{reference}})',
   'An artist uploaded an invoice for {{event_name}} ({{reference}}). Mark it received or paid on the admin event page.'),
  ('admin.artist_invoice_uploaded', 'email', 'Invoice uploaded: {{event_name}} · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   'An artist uploaded an invoice for {{event_name}} ({{reference}}). Mark it received or paid on the admin event page.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
