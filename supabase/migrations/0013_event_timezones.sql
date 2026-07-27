-- =============================================================================
-- Live-En-Synergy — event start times and time zones
--
-- Raised in the 27 Jul standup: event timelines carried no time zone, so a
-- listing couldn't be read correctly from another region, and nothing handled
-- the seasonal GMT/BST switch.
--
-- `event_date` was a bare `date` — no time of day at all — so "7 Aug, 19:30
-- BST" was not expressible. Rather than migrate the column to timestamptz and
-- force every existing row to acquire a spurious midnight, this adds:
--
--   start_time  the local clock time at the venue (nullable — "TBC" is valid)
--   timezone    the IANA zone that clock time is in
--
-- Storing wall-clock + zone rather than a UTC instant is deliberate. An event
-- billed as "doors 19:30" stays 19:30 local even if the government moves the
-- clocks between listing and showtime; a stored UTC instant would silently
-- drift by an hour. `Intl.DateTimeFormat` resolves the correct abbreviation
-- (GMT vs BST) for the actual date, so the seasonal change is automatic.
-- =============================================================================

alter table event_listings
  add column start_time time,
  add column timezone   text not null default 'Europe/London';

alter table sponsored_events
  add column start_time time,
  add column timezone   text not null default 'Europe/London';

comment on column event_listings.timezone is
  'IANA zone (e.g. Europe/London) that start_time is expressed in.';
comment on column sponsored_events.timezone is
  'IANA zone (e.g. Europe/London) that start_time is expressed in.';
