-- =============================================================================
-- 0095 — the public event page (GitHub #48).
--
-- Sakshi's General Notes (26 Oct): the event page should be the main source
-- of information about a live campaign event — the event, the research
-- campaign, the ticket discount, how it works, who's eligible, and the
-- Start survey button. Until now there was only the signed-in
-- /dashboard/discover/[id] page and the bare survey link.
--
-- 1. sponsored_event_pages — the copy the team writes for the page, one row
--    per sponsored event, admin-only (RLS: is_admin(); no other policy).
--    A separate table rather than columns on sponsored_events: the brand and
--    the artist can update their own sponsored_events row, and this copy is
--    the team's to publish. Every field is optional; a missing one is
--    skipped on the page, never printed as an empty label.
--
-- 2. public_event_page(id) — definer, anon-callable. Returns one jsonb
--    document with exactly the fields the page shows, or null when the
--    event isn't public. Public means:
--      - the sponsored event is confirmed or completed (not in_progress,
--        not withdrawn), and
--      - it belongs to a campaign that is paid and live: status
--        in_progress or completed. awaiting_payment (unpaid) and closed
--        never show, and an event with no campaign (pre-gate legacy) doesn't
--        either.
--    sponsored_events is readable signed-in only, so this is the only way
--    the page sees it — the same column-list technique as the
--    public_*_profiles views. Nothing commercial leaves: no budget, fee,
--    margin, shared code, code prefix, cap or count. "Codes still
--    available" comes from survey_codes_state() (0088), which answers in
--    one word.
--
-- 3. public_live_events() — the list behind the "Live now" cards on
--    /events: the same visibility rule, upcoming (or undated) events only.
--
-- Additive: a new table and two new functions. Nothing existing reads them,
-- so this can be applied before or after the code deploys; the page 404s
-- until it is.
-- =============================================================================

create table if not exists sponsored_event_pages (
  sponsored_event_id    uuid primary key references sponsored_events (id) on delete cascade,
  -- About the event
  event_description     text,
  age_restriction       text,            -- e.g. "18+ (ID required)"; null = not stated
  ticket_url            text,            -- falls back to the listing's ticket_buy_url
  -- About the research campaign
  research_about        text,            -- what the survey is about
  research_why          text,            -- why the brand wants feedback
  survey_minutes        integer check (survey_minutes is null or survey_minutes between 1 and 120),
  -- Your ticket discount
  eligible_tickets      text,            -- e.g. "General admission and VIP"
  booking_fees_excluded boolean,         -- null = not stated
  single_use            boolean,
  combinable            boolean,         -- can it combine with other offers
  code_limit_note       text,            -- e.g. "One code per person, while codes last"
  offer_lines           text[] not null default '{}',
  -- Eligibility
  account_required      boolean not null default false,
  participation_limit   text,            -- e.g. "One response per person"
  eligibility_lines     text[] not null default '{}',
  updated_at            timestamptz not null default now(),
  updated_by            uuid references profiles (id) on delete set null
);

alter table sponsored_event_pages enable row level security;

drop policy if exists "sponsored_event_pages: admin all" on sponsored_event_pages;
create policy "sponsored_event_pages: admin all" on sponsored_event_pages
  for all using (is_admin()) with check (is_admin());

grant select, insert, update, delete on sponsored_event_pages to authenticated;

drop trigger if exists sponsored_event_pages_set_updated_at on sponsored_event_pages;
create trigger sponsored_event_pages_set_updated_at before update on sponsored_event_pages
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- The visibility rule, in one place.
-- ---------------------------------------------------------------------------
create or replace function sponsored_event_is_public(p_id uuid)
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
  )
$$;
revoke all on function sponsored_event_is_public(uuid) from public;
grant execute on function sponsored_event_is_public(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The page.
-- ---------------------------------------------------------------------------
create or replace function public_event_page(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.sponsored_event_is_public(p_id) then null else (
    select jsonb_build_object(
      'id',                se.id,
      'name',              se.name,
      'status',            se.status,
      'event_date',        coalesce(se.event_date, l.event_date),
      'start_time',        coalesce(se.start_time, l.start_time),
      'end_time',          l.end_time,
      'timezone',          coalesce(se.timezone, l.timezone, 'Europe/London'),
      'venue_name',        l.venue_name,
      'city',              l.city,
      'country',           l.country,
      'location',          se.location,
      'venue_details',     se.venue_details,
      'category',          coalesce(l.category, c.category),
      'banner_url',        coalesce(se.banner_url, l.image_url, c.image_url),
      'artist_name',       coalesce(nullif(se.artist_display_name, ''), a.stage_name, a.artist_name, o.event_name),
      'campaign_name',     c.campaign_name,
      'campaign_status',   c.status,
      'opens_at',          c.opens_at,
      'is_open',           public.campaign_is_open(c.id),
      'participation_deadline', se.participation_deadline,
      'reward_rules',      se.reward_rules,
      'brand', case when bp.id is null then null else jsonb_build_object(
          'name',        b.brand_name,
          'logo_url',    b.logo_url,
          'banner_url',  b.banner_url,
          'description', b.description,
          'website_url', b.website_url) end,
      'page',              to_jsonb(pg) - 'updated_by' - 'sponsored_event_id',
      'ticket_url',        coalesce(nullif(pg.ticket_url, ''), l.ticket_buy_url),
      'tiers', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'label',               t.label,
                   'code_type',           t.code_type,
                   'discount_percent',    t.discount_percent,
                   'value_label',         t.value_label,
                   'value_gbp',           t.value_gbp,
                   'reward_description',  t.reward_description,
                   'redemption_platform', t.redemption_platform,
                   'valid_until',         t.valid_until)
                 order by t.rank)
            from public.sponsored_event_reward_tiers t
           where t.sponsored_event_id = se.id), '[]'::jsonb),
      'survey', (
          select jsonb_build_object('id', st.id, 'title', st.title, 'description', st.description)
            from public.survey_templates st
           where st.campaign_id = c.id
             and st.kind = 'pre_event'
             and st.status = 'published'
             and st.is_public
           order by st.published_at desc nulls last, st.created_at desc
           limit 1)
    )
      from public.sponsored_events se
      join public.campaigns c on c.id = se.campaign_id
      left join public.brands b on b.id = se.brand_id
      left join public.profiles bp on bp.id = b.profile_id and bp.is_active
      left join public.event_listings l on l.id = se.listing_id
      left join public.artists a on a.id = l.artist_id
      left join public.event_organisers o on o.id = l.organiser_id
      left join public.sponsored_event_pages pg on pg.sponsored_event_id = se.id
     where se.id = p_id
  ) end
$$;
revoke all on function public_event_page(uuid) from public;
grant execute on function public_event_page(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The "Live now" list on /events.
-- ---------------------------------------------------------------------------
create or replace function public_live_events()
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
     and (coalesce(se.event_date, l.event_date) is null
          or coalesce(se.event_date, l.event_date)
             >= (now() at time zone coalesce(se.timezone, 'Europe/London'))::date)
   order by coalesce(se.event_date, l.event_date) asc nulls last, se.created_at desc
$$;
revoke all on function public_live_events() from public;
grant execute on function public_live_events() to anon, authenticated, service_role;
