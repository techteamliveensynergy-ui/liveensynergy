-- =============================================================================
-- 0120 — Link the brand on the public event page to its public profile
-- (client, 13 Nov: "once the brand is attached to an event, it should take
-- them to the brand's profile too, if that is there").
--
-- public_event_page() (0095) deliberately returns only chosen fields and not
-- the brand's profile id. This returns just that one id, and only when the
-- event is public (same gate as the page) and the brand has a public profile
-- (public_brand_profiles: active account, onboarding finished) — otherwise
-- null and the page shows the brand name without a link.
--
-- Additive and re-runnable.
-- =============================================================================
create or replace function public.public_event_brand_profile(p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.profile_id
    from public.sponsored_events se
    join public.brands b on b.id = se.brand_id
    join public.public_brand_profiles pbp on pbp.profile_id = b.profile_id
   where se.id = p_id
     and public.public_event_page(p_id) is not null
$$;
revoke all on function public.public_event_brand_profile(uuid) from public;
grant execute on function public.public_event_brand_profile(uuid) to anon, authenticated, service_role;
