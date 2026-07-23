-- =============================================================================
-- Live-En-Synergy — admin user management: blocking audit + activity tracking
--
-- `is_active` (added in 0003) stays the single source of truth for "can this
-- account use the platform". This adds the audit trail around it, plus the
-- activity signal the admin user list filters on.
-- =============================================================================

alter table profiles
  add column blocked_at    timestamptz,
  add column blocked_reason text,
  add column last_seen_at  timestamptz;

-- Filtering / sorting the admin user list.
create index profiles_last_seen_at_idx on profiles (last_seen_at desc nulls last);
create index profiles_role_idx         on profiles (role);
create index profiles_is_active_idx    on profiles (is_active);

-- ---------------------------------------------------------------------------
-- Last sign-in lives on auth.users, which RLS does not expose to the client.
-- This hands admins (and only admins) the id -> last_sign_in_at mapping so the
-- user list can show "last login" alongside our own "last seen" column.
-- ---------------------------------------------------------------------------
create or replace function admin_auth_activity()
returns table (id uuid, last_sign_in_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  where public.is_admin();
$$;

revoke all on function admin_auth_activity() from public;
grant execute on function admin_auth_activity() to authenticated;

-- ---------------------------------------------------------------------------
-- Let a signed-in user stamp their own activity without widening profile
-- update rights. Called from middleware, throttled to ~once per 5 minutes.
-- ---------------------------------------------------------------------------
create or replace function touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

revoke all on function touch_last_seen() from public;
grant execute on function touch_last_seen() to authenticated;
