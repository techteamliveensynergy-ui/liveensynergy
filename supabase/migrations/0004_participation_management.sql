-- =============================================================================
-- Live-En-Synergy — allow the event's parties to manage participations
--
-- 0002_policies.sql gave the sponsoring brand and the artist SELECT access to
-- participations ("participations: event party read") but no UPDATE policy.
-- That silently broke the organiser-side workflow: the Select / Verify
-- attendance / Release reward actions ran without error but RLS matched zero
-- rows, so nothing ever changed. This adds the matching UPDATE policy.
--
-- Audience members keep their own full access via "participations: audience
-- owner"; this policy only covers the counterparties to the sponsored event.
-- =============================================================================

create or replace function is_sponsored_event_party(event_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.sponsored_events se
    where se.id = event_id
      and (
        se.artist_profile_id = auth.uid()
        or exists (
          select 1 from public.brands b
          where b.id = se.brand_id and b.profile_id = auth.uid()
        )
      )
  );
$$;

create policy "participations: event party manage"
  on participations for update
  using (is_admin() or is_sponsored_event_party(sponsored_event_id))
  with check (is_admin() or is_sponsored_event_party(sponsored_event_id));
