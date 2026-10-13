-- =============================================================================
-- 0069 — Every account proves it owns its email address (client, 13 Oct).
--
-- "All our communication is by email, so the address must be authentic, and
-- nothing on the platform should be usable before it is confirmed."
--
-- Ordinary sign-ups already can't sign in until they click Supabase's
-- confirmation link. The exception is the survey sign-up (FB-00032): it
-- creates the account already "confirmed" (admin createUser, email_confirm)
-- so the respondent can carry on answering at once, then emails a
-- set-your-password link. Nothing ever checked that link was used.
--
--   profiles.email_verified_at — when the person proved the address. Set:
--     * at sign-up / on confirmation for ordinary accounts (auth.users
--       email_confirmed_at), in handle_new_user() and a trigger on auth.users;
--     * for survey accounts only when they open a link from our email —
--       mark_email_verified(), called by /auth/callback, which checks the
--       session itself came from an emailed link (JWT amr).
--   The app (middleware) keeps an unverified account to its profile,
--   settings and surveys, with a banner and a resend button.
--
-- Backfill (L4): every existing account confirmed through Supabase is
-- verified now; survey accounts stay unverified until they use a link.
-- profiles_guard: email_verified_at is admin/definer-only, like role/status.
-- =============================================================================

alter table public.profiles
  add column if not exists email_verified_at timestamptz;

update public.profiles p
   set email_verified_at = u.email_confirmed_at
  from auth.users u
 where u.id = p.id
   and p.email_verified_at is null
   and u.email_confirmed_at is not null
   and coalesce((u.raw_user_meta_data ->> 'survey_account')::boolean, false) = false;

-- A survey account skipped confirmation, so its confirmed_at proves nothing.
create or replace function public.email_confirmation_counts(u auth.users)
returns boolean
language sql
immutable
as $$
  select u.email_confirmed_at is not null
     and coalesce((u.raw_user_meta_data ->> 'survey_account')::boolean, false) = false;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (
    id, role, full_name, email, terms_accepted_at, terms_version, email_verified_at
  )
  values (
    new.id,
    case when v_role in ('brand', 'artist', 'event', 'audience')
         then v_role::user_role else 'audience'::user_role end,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    new.raw_user_meta_data ->> 'terms_version',
    case when public.email_confirmation_counts(new) then new.email_confirmed_at end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- Clicking Supabase's confirmation link sets auth.users.email_confirmed_at.
create or replace function public.sync_email_verified()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.email_confirmation_counts(new) then
    update public.profiles
       set email_verified_at = coalesce(email_verified_at, new.email_confirmed_at)
     where id = new.id and email_verified_at is null;
  end if;
  return new;
end;
$$;

create or replace trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (new.email_confirmed_at is not null and old.email_confirmed_at is null)
  execute function public.sync_email_verified();

-- Called by /auth/callback after it signs someone in from an emailed link.
-- Only a session that itself came from an email (recovery, magic link,
-- one-time code, sign-up confirmation, invite) counts — a password sign-in
-- proves nothing about the address.
create or replace function public.mark_email_verified()
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_methods text[];
begin
  if auth.uid() is null then
    return false;
  end if;
  select coalesce(array_agg(m ->> 'method'), '{}')
    into v_methods
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) m;
  if not (v_methods && array['recovery', 'magiclink', 'otp', 'email/signup', 'invite', 'email_change']) then
    return false;
  end if;
  update public.profiles
     set email_verified_at = now()
   where id = auth.uid() and email_verified_at is null;
  return true;
end;
$$;

revoke all on function public.mark_email_verified() from public, anon;
grant execute on function public.mark_email_verified() to authenticated;
revoke all on function public.sync_email_verified() from public, anon, authenticated;

-- Users can't mark themselves verified.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_untrusted_writer() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'admin' or coalesce(new.is_active, true) = false
       or new.suspended_until is not null or new.blocked_at is not null
       or new.plan_id is not null or new.email_verified_at is not null then
      raise exception 'Not allowed to set account status fields' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.blocked_at is distinct from old.blocked_at
     or new.blocked_reason is distinct from old.blocked_reason
     or new.suspended_until is distinct from old.suspended_until
     or new.plan_id is distinct from old.plan_id
     or new.email is distinct from old.email
     or new.terms_accepted_at is distinct from old.terms_accepted_at
     or new.terms_version is distinct from old.terms_version
     or new.email_verified_at is distinct from old.email_verified_at
     or new.id is distinct from old.id then
    raise exception 'Only an admin can change account role, status, plan, email or terms' using errcode = '42501';
  end if;
  return new;
end;
$$;
