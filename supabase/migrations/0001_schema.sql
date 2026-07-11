-- =============================================================================
-- Live-En-Synergy — core schema (MVP V1)
-- Roles: brand / artist / event organiser / audience (+ admin)
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('brand', 'artist', 'event', 'audience', 'admin');
create type campaign_status as enum ('in_progress', 'closed', 'completed');
create type sponsorship_status as enum ('in_progress', 'confirmed', 'completed');
create type listing_status as enum ('draft', 'available', 'matched', 'closed');
create type participation_status as enum (
  'registered', 'ticket_uploaded', 'attendance_verified', 'reward_released', 'rejected'
);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, created automatically on sign-up
-- ---------------------------------------------------------------------------
create table profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  role                  user_role not null default 'audience',
  full_name             text,
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Create the profile row from the sign-up metadata (role + full_name).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'audience'),
    new.raw_user_meta_data ->> 'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Admin check that bypasses RLS (avoids recursive policy evaluation).
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- brands
-- ---------------------------------------------------------------------------
create table brands (
  id                        uuid primary key default gen_random_uuid(),
  profile_id                uuid not null unique references profiles (id) on delete cascade,
  brand_name                text not null,
  description               text,
  logo_url                  text,
  banner_url                text,
  product_category          text,
  product_category_other    text,
  website_url               text,
  social_links              jsonb,
  -- internal (brand + Live-En-Synergy team only)
  mission_vision            text,
  target_audience_keywords  text[],
  brand_keywords            text[],
  preferred_genres          text,
  preferred_locations       text,
  manager_name              text,
  manager_email             text,
  manager_phone             text,
  company_address           text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create trigger brands_set_updated_at before update on brands
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- artists
-- ---------------------------------------------------------------------------
create table artists (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null unique references profiles (id) on delete cascade,
  artist_name            text not null,
  stage_name             text,
  bio                    text,
  profile_image_url      text,
  banner_url             text,
  category               text,
  category_other         text,
  website_url            text,
  social_links           jsonb,
  -- internal use only
  date_of_birth          date,
  location               text,
  contact_name           text,
  contact_email          text,
  contact_phone          text,
  address                text,
  art_keywords           text[],
  mission_vision         text,
  sponsor_value_details  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger artists_set_updated_at before update on artists
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- event_organisers
-- ---------------------------------------------------------------------------
create table event_organisers (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid not null unique references profiles (id) on delete cascade,
  event_name             text not null,
  description            text,
  profile_image_url      text,
  banner_url             text,
  category               text,
  category_other         text,
  website_url            text,
  social_links           jsonb,
  -- internal use only
  existing_partners      text,
  contact_name           text,
  contact_email          text,
  contact_phone          text,
  company_address        text,
  keywords               text[],
  mission_vision         text,
  sponsor_value_details  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger event_organisers_set_updated_at before update on event_organisers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- audience_members
-- ---------------------------------------------------------------------------
create table audience_members (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null unique references profiles (id) on delete cascade,
  full_name      text not null,
  phone          text,
  date_of_birth  date,
  address        text,
  postcode       text,
  verified       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger audience_members_set_updated_at before update on audience_members
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- campaigns — brand-created sponsorship proposals
-- ---------------------------------------------------------------------------
create table campaigns (
  id                     uuid primary key default gen_random_uuid(),
  brand_id               uuid not null references brands (id) on delete cascade,
  reference             text unique default ('CMP-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  description            text not null,
  budget_gbp             numeric(12, 2) not null check (budget_gbp >= 0),
  category               text,
  category_other         text,
  preferred_location     text,
  preferred_timeline     text,
  target_name            text,           -- known artist/event, if any
  reward_rules           text,
  additional_info        text,
  manager_name           text,
  manager_email          text,
  status                 campaign_status not null default 'in_progress',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on campaigns (brand_id);
create trigger campaigns_set_updated_at before update on campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- event_listings — upcoming events available for sponsorship
-- Owned by either an artist or an event organiser.
-- ---------------------------------------------------------------------------
create table event_listings (
  id                     uuid primary key default gen_random_uuid(),
  reference             text unique default ('EVT-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  owner_profile_id       uuid not null references profiles (id) on delete cascade,
  artist_id              uuid references artists (id) on delete set null,
  organiser_id           uuid references event_organisers (id) on delete set null,
  name                   text not null,
  event_date             date,
  venue_name             text,
  city                   text,
  country                text,
  category               text,
  capacity               integer,
  ticket_price_gbp       numeric(10, 2),
  ticket_buy_url         text,
  budget_range           text,
  existing_sponsors      text,
  sponsor_benefits       text,
  status                 listing_status not null default 'draft',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on event_listings (owner_profile_id);
create index on event_listings (status);
create trigger event_listings_set_updated_at before update on event_listings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- sponsored_events — confirmed sponsorships linking brand + artist/listing
-- ---------------------------------------------------------------------------
create table sponsored_events (
  id                     uuid primary key default gen_random_uuid(),
  reference             text unique default ('SPE-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  brand_id               uuid references brands (id) on delete set null,
  campaign_id            uuid references campaigns (id) on delete set null,
  listing_id             uuid references event_listings (id) on delete set null,
  artist_profile_id      uuid references profiles (id) on delete set null,
  name                   text not null,
  event_date             date,
  venue_details          text,
  location               text,
  budget_gbp             numeric(12, 2),
  remaining_budget_gbp   numeric(12, 2),
  reward_rules           text,
  terms                  text,
  brand_agreed           boolean not null default false,
  artist_agreed          boolean not null default false,
  participation_deadline date,
  status                 sponsorship_status not null default 'in_progress',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on sponsored_events (brand_id);
create index on sponsored_events (artist_profile_id);
create trigger sponsored_events_set_updated_at before update on sponsored_events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- participations — audience sign-ups for a sponsored event
-- ---------------------------------------------------------------------------
create table participations (
  id                     uuid primary key default gen_random_uuid(),
  sponsored_event_id     uuid not null references sponsored_events (id) on delete cascade,
  audience_profile_id    uuid not null references profiles (id) on delete cascade,
  -- selection / raw data
  status                 participation_status not null default 'registered',
  selected               boolean not null default false,
  -- verification
  ticket_proof_url       text,
  attendance_verified_at timestamptz,
  -- reward payout (collected only after selection + consent)
  reward_amount_gbp      numeric(10, 2),
  reward_released_at     timestamptz,
  newsletter_opt_in      boolean not null default false,
  bank_details_provided  boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (sponsored_event_id, audience_profile_id)
);
create index on participations (sponsored_event_id);
create index on participations (audience_profile_id);
create trigger participations_set_updated_at before update on participations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- messages — direct chat between a sponsor and an artist/organiser
-- ---------------------------------------------------------------------------
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  brand_profile_id   uuid not null references profiles (id) on delete cascade,
  partner_profile_id uuid not null references profiles (id) on delete cascade,
  listing_id    uuid references event_listings (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (brand_profile_id, partner_profile_id, listing_id)
);

create table messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations (id) on delete cascade,
  sender_profile_id uuid not null references profiles (id) on delete cascade,
  body             text not null,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index on messages (conversation_id);

-- ---------------------------------------------------------------------------
-- contact_messages — public "Contact us" submissions
-- ---------------------------------------------------------------------------
create table contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  subject     text,
  body        text not null,
  created_at  timestamptz not null default now()
);
