-- =============================================================================
-- Live-En-Synergy — Admin Portal / Audience Portal review fixes (31 Jul standup)
--
-- Every change here is additive only (new nullable-or-defaulted columns, one
-- new unique index) — nothing existing is renamed, dropped, or has its type
-- or constraints changed, so it is safe to run against a database that
-- already has data and does not require touching any existing RLS policy
-- (those are row-level, not column-level, so they already cover new columns
-- on tables they already grant access to).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- audience_members — split phone number into country code + local number
-- ---------------------------------------------------------------------------
alter table audience_members
  add column phone_country_code text not null default '+44';

-- ---------------------------------------------------------------------------
-- sponsored_events — one stable token per event for the QR / link
-- attendance check-in flow (audience scans it at the venue, or follows the
-- link, to self-confirm attendance from src/app/attend/[token]).
-- ---------------------------------------------------------------------------
alter table sponsored_events
  add column attendance_qr_token uuid not null default gen_random_uuid();

create unique index sponsored_events_attendance_qr_token_idx
  on sponsored_events (attendance_qr_token);

-- ---------------------------------------------------------------------------
-- participations — selection timestamp (needed to compute the "upload your
-- ticket within a week of selection" deadline) and no-show tracking (feeds
-- the automatic 3-strikes account suspension).
-- ---------------------------------------------------------------------------
alter table participations
  add column selected_at timestamptz,
  add column no_show boolean not null default false,
  add column no_show_marked_at timestamptz;

-- ---------------------------------------------------------------------------
-- profiles — expiry for an automatic suspension, so a 3-strikes block lifts
-- itself after a year instead of staying blocked forever.
-- ---------------------------------------------------------------------------
alter table profiles
  add column suspended_until timestamptz;
