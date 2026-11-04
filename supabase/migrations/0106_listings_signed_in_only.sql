-- =============================================================================
-- 0106 — event listings are no longer readable by signed-out visitors
-- (2 Nov standup: keep events off the public site; brands enquire through the
-- team).
--
-- 0002's "event_listings: public read available" policy applied to everyone,
-- including anonymous visitors — which is how listings reached the public
-- /events page and the "upcoming events" block on public profiles. Both of
-- those are removed in the code that ships with this migration, and this
-- closes the same door at the database, so the API can't be used to list them
-- either.
--
-- Same predicate, now `to authenticated`: brands discovering listings inside
-- the dashboard, owners and admins are unaffected.
--
-- Safe to apply before OR after the code (nothing signed-out reads listings any
-- more). Re-runnable.
-- =============================================================================
drop policy if exists "event_listings: public read available" on public.event_listings;
drop policy if exists "event_listings: signed-in read available" on public.event_listings;
create policy "event_listings: signed-in read available"
  on public.event_listings for select to authenticated
  using (status = 'available' or owner_profile_id = auth.uid() or public.is_admin());
