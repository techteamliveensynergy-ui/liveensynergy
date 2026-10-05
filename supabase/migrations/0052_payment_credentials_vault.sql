-- =============================================================================
-- Live-En-Synergy — Stripe keys move into Supabase Vault.
--
-- 0050 encrypted keys in the app under a master key (PAYMENT_CREDS_ENCRYPTION_KEY)
-- that had to be generated and set in Vercel per environment. That setup step
-- proved a stumbling block, so keys now live in Supabase Vault instead: Vault
-- encrypts each secret with a key Supabase manages outside the database, so
-- backups and dumps hold only ciphertext, and there is nothing to configure.
--
-- What does NOT change: the admin screen, the masked status, the audit log,
-- the admin notifications, the Live-mode guard, and the rule that no browser
-- session (admin included) can ever read a key back. payment_credentials keeps
-- only a pointer (the Vault secret's id) plus the masked/verification facts.
--
-- Plaintext can be read back ONLY by payment_secret_key(), which is executable
-- by the service role alone — i.e. our server, never a user session.
-- =============================================================================

alter table payment_credentials
  add column if not exists secret_key_vault_id     uuid,
  add column if not exists webhook_secret_vault_id uuid;

-- The app-encrypted columns from 0050 are retired. Nothing could be saved
-- without the master key, but clear any row that was, so the screen can't show
-- a key the new code can't read.
update payment_credentials
   set secret_key_ct = null, secret_key_last4 = null, secret_key_kind = null,
       stripe_account_id = null, stripe_account_name = null, verified_at = null
 where secret_key_ct is not null;
update payment_credentials
   set webhook_secret_ct = null, webhook_secret_last4 = null
 where webhook_secret_ct is not null;

-- ---------------------------------------------------------------------------
-- Store or replace a secret in Vault under a stable name; returns its id.
-- Internal helper: callable only from the definer functions below.
-- ---------------------------------------------------------------------------
create or replace function payment_vault_put(p_name text, p_secret text, p_existing uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_existing;
begin
  if v_id is null then
    select id into v_id from vault.secrets where name = p_name;
  end if;
  if v_id is null then
    v_id := vault.create_secret(p_secret, p_name, 'Live-En-Synergy Stripe credential');
  else
    perform vault.update_secret(v_id, p_secret);
  end if;
  return v_id;
end;
$$;
revoke all on function payment_vault_put(text, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writes (admin-checked, audited in the same transaction). Signatures change
-- from ciphertext to plaintext, so the 0050 versions are dropped first.
-- ---------------------------------------------------------------------------
drop function if exists save_payment_secret_key(text, text, text, text, text, text, text);
create function save_payment_secret_key(
  p_mode text, p_secret text, p_last4 text, p_kind text,
  p_account_id text, p_account_name text, p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change payment settings.' using errcode = '42501';
  end if;
  if p_mode not in ('test', 'live') or coalesce(p_secret, '') = '' then
    raise exception 'Invalid payment credential.';
  end if;

  select secret_key_vault_id into v_existing from public.payment_credentials where mode = p_mode;
  v_id := public.payment_vault_put('stripe_secret_key_' || p_mode, p_secret, v_existing);

  insert into public.payment_credentials as c
    (mode, secret_key_vault_id, secret_key_last4, secret_key_kind,
     stripe_account_id, stripe_account_name, verified_at, updated_by, updated_at)
  values
    (p_mode, v_id, p_last4, p_kind, p_account_id, p_account_name, now(), auth.uid(), now())
  on conflict (mode) do update
    set secret_key_vault_id = excluded.secret_key_vault_id,
        secret_key_last4    = excluded.secret_key_last4,
        secret_key_kind     = excluded.secret_key_kind,
        stripe_account_id   = excluded.stripe_account_id,
        stripe_account_name = excluded.stripe_account_name,
        verified_at         = now(),
        updated_by          = auth.uid(),
        updated_at          = now();

  insert into public.payment_settings_audit (actor, action, mode, detail, ip_hash)
  values (auth.uid(), 'save_secret_key', p_mode,
          coalesce(p_kind, 'secret') || ' key ending ' || coalesce(p_last4, '?')
            || coalesce(' · account ' || p_account_id, ''),
          p_ip_hash);
end;
$$;
revoke all on function save_payment_secret_key(text, text, text, text, text, text, text) from public, anon;
grant execute on function save_payment_secret_key(text, text, text, text, text, text, text) to authenticated;

drop function if exists save_payment_webhook_secret(text, text, text, text);
create function save_payment_webhook_secret(
  p_mode text, p_secret text, p_last4 text, p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_id       uuid;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change payment settings.' using errcode = '42501';
  end if;
  if p_mode not in ('test', 'live') or coalesce(p_secret, '') = '' then
    raise exception 'Invalid payment credential.';
  end if;

  select webhook_secret_vault_id into v_existing from public.payment_credentials where mode = p_mode;
  v_id := public.payment_vault_put('stripe_webhook_secret_' || p_mode, p_secret, v_existing);

  insert into public.payment_credentials as c
    (mode, webhook_secret_vault_id, webhook_secret_last4, updated_by, updated_at)
  values (p_mode, v_id, p_last4, auth.uid(), now())
  on conflict (mode) do update
    set webhook_secret_vault_id = excluded.webhook_secret_vault_id,
        webhook_secret_last4    = excluded.webhook_secret_last4,
        updated_by              = auth.uid(),
        updated_at              = now();

  insert into public.payment_settings_audit (actor, action, mode, detail, ip_hash)
  values (auth.uid(), 'save_webhook_secret', p_mode,
          'webhook secret ending ' || coalesce(p_last4, '?'), p_ip_hash);
end;
$$;
revoke all on function save_payment_webhook_secret(text, text, text, text) from public, anon;
grant execute on function save_payment_webhook_secret(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Status and guards now key off the Vault pointer.
-- ---------------------------------------------------------------------------
create or replace function payment_credentials_status()
returns table (
  mode                 text,
  has_secret_key       boolean,
  secret_key_last4     text,
  secret_key_kind      text,
  has_webhook_secret   boolean,
  webhook_secret_last4 text,
  stripe_account_id    text,
  stripe_account_name  text,
  verified_at          timestamptz,
  updated_at           timestamptz,
  updated_by_name      text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view payment settings.' using errcode = '42501';
  end if;
  return query
    select c.mode,
           c.secret_key_vault_id is not null,
           c.secret_key_last4,
           c.secret_key_kind,
           c.webhook_secret_vault_id is not null,
           c.webhook_secret_last4,
           c.stripe_account_id,
           c.stripe_account_name,
           c.verified_at,
           c.updated_at,
           p.full_name
      from public.payment_credentials c
      left join public.profiles p on p.id = c.updated_by;
end;
$$;

create or replace function record_payment_verification(
  p_mode text, p_account_id text, p_account_name text, p_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change payment settings.' using errcode = '42501';
  end if;
  update public.payment_credentials
     set verified_at = now(),
         stripe_account_id = coalesce(p_account_id, stripe_account_id),
         stripe_account_name = coalesce(p_account_name, stripe_account_name)
   where mode = p_mode and secret_key_vault_id is not null;
  if not found then
    raise exception 'No % key is saved yet.', p_mode;
  end if;

  insert into public.payment_settings_audit (actor, action, mode, detail, ip_hash)
  values (auth.uid(), 'verify', p_mode,
          'verified' || coalesce(' · account ' || p_account_id, ''), p_ip_hash);
end;
$$;

create or replace function set_payment_mode(p_mode text, p_ip_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change payment settings.' using errcode = '42501';
  end if;
  if p_mode not in ('test', 'live') then
    raise exception 'Unknown payment mode.';
  end if;
  if p_mode = 'live' and not exists (
    select 1 from public.payment_credentials
     where mode = 'live' and secret_key_vault_id is not null and verified_at is not null
  ) then
    raise exception 'Save and verify a live secret key before switching to Live.';
  end if;

  select active_mode into v_current from public.payment_settings where id for update;
  if v_current = p_mode then
    return;
  end if;

  update public.payment_settings
     set active_mode = p_mode, changed_by = auth.uid(), changed_at = now()
   where id;

  insert into public.payment_settings_audit (actor, action, mode, detail, ip_hash)
  values (auth.uid(), 'set_mode', p_mode, v_current || ' → ' || p_mode, p_ip_hash);
end;
$$;

-- ---------------------------------------------------------------------------
-- The ONLY way to read a key back in plaintext. Service role only: our server
-- calls it to re-verify a key now, and to call Stripe later. No user session —
-- admin or otherwise — can execute it.
-- ---------------------------------------------------------------------------
create or replace function payment_secret_key(p_mode text, p_field text default 'secret_key')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     uuid;
  v_secret text;
begin
  select case when p_field = 'webhook_secret' then webhook_secret_vault_id
              else secret_key_vault_id end
    into v_id
    from public.payment_credentials
   where mode = p_mode;
  if v_id is null then
    return null;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where id = v_id;
  return v_secret;
end;
$$;
revoke all on function payment_secret_key(text, text) from public, anon, authenticated;
grant execute on function payment_secret_key(text, text) to service_role;
