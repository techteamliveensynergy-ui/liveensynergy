-- =============================================================================
-- Live-En-Synergy — Stripe credentials managed from the admin panel
-- (docs/payments-email-implementation-plan.md §1b).
--
-- Admins enter test and live Stripe keys on a screen instead of in Vercel env
-- vars, and choose which mode is active. The keys are encrypted IN THE APP
-- (AES-256-GCM, master key PAYMENT_CREDS_ENCRYPTION_KEY, which lives only in
-- Vercel) before they reach this database, so a leaked dump/backup or Supabase
-- dashboard access yields only ciphertext.
--
-- These tables are locked: RLS on with NO policies and no table grants for
-- anon/authenticated. Admins write through admin-checked security-definer
-- functions (each writing its audit row in the same transaction) and read
-- only masked status through payment_credentials_status(), which never
-- selects the ciphertext columns. Only the server-side service role reads the
-- ciphertext back (src/lib/payment-credentials.ts).
-- =============================================================================

create table if not exists payment_credentials (
  mode                 text primary key check (mode in ('test', 'live')),
  secret_key_ct        text,
  secret_key_last4     text,
  secret_key_kind      text check (secret_key_kind in ('secret', 'restricted')),
  webhook_secret_ct    text,
  webhook_secret_last4 text,
  stripe_account_id    text,
  stripe_account_name  text,
  verified_at          timestamptz,
  key_version          int not null default 1,
  updated_by           uuid references profiles (id) on delete set null,
  updated_at           timestamptz not null default now()
);

create table if not exists payment_settings (
  id          boolean primary key default true check (id),
  active_mode text not null default 'test' check (active_mode in ('test', 'live')),
  changed_by  uuid references profiles (id) on delete set null,
  changed_at  timestamptz not null default now()
);
insert into payment_settings (id) values (true) on conflict (id) do nothing;

create table if not exists payment_settings_audit (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references profiles (id) on delete set null,
  action     text not null check (action in
               ('save_secret_key', 'save_webhook_secret', 'verify', 'set_mode')),
  mode       text check (mode in ('test', 'live')),
  detail     text,
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index if not exists payment_settings_audit_created_idx
  on payment_settings_audit (created_at desc);

alter table payment_credentials    enable row level security;
alter table payment_settings       enable row level security;
alter table payment_settings_audit enable row level security;

-- No policies at all on the two key tables, and no direct grants either.
revoke all on payment_credentials from anon, authenticated;
revoke all on payment_settings    from anon, authenticated;

-- The audit trail is readable by admins (it never holds a key value).
create policy "payment_settings_audit: admin read"
  on payment_settings_audit for select using (is_admin());
revoke insert, update, delete on payment_settings_audit from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Generic per-user throttle. Keyed on the CALLER's own auth.uid(), so calling
-- it directly can only ever throttle yourself.
-- ---------------------------------------------------------------------------
create table if not exists rate_limit_events (
  id         bigserial primary key,
  key        text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_key_idx on rate_limit_events (key, created_at);
alter table rate_limit_events enable row level security;
revoke all on rate_limit_events from anon, authenticated;

create or replace function rate_limit_hit(p_action text, p_window_seconds int, p_max int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key   text;
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;
  v_key := p_action || ':' || auth.uid()::text;

  delete from public.rate_limit_events
   where key = v_key
     and created_at < now() - make_interval(secs => greatest(p_window_seconds, 1) * 2);

  select count(*) into v_count
    from public.rate_limit_events
   where key = v_key
     and created_at > now() - make_interval(secs => greatest(p_window_seconds, 1));
  if v_count >= p_max then
    return false;
  end if;

  insert into public.rate_limit_events (key) values (v_key);
  return true;
end;
$$;
revoke all on function rate_limit_hit(text, int, int) from public, anon;
grant execute on function rate_limit_hit(text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Masked status for the admin screen. NEVER selects *_ct columns.
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
           c.secret_key_ct is not null,
           c.secret_key_last4,
           c.secret_key_kind,
           c.webhook_secret_ct is not null,
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
revoke all on function payment_credentials_status() from public, anon;
grant execute on function payment_credentials_status() to authenticated;

create or replace function payment_settings_status()
returns table (active_mode text, changed_at timestamptz, changed_by_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can view payment settings.' using errcode = '42501';
  end if;
  return query
    select s.active_mode, s.changed_at, p.full_name
      from public.payment_settings s
      left join public.profiles p on p.id = s.changed_by
     where s.id;
end;
$$;
revoke all on function payment_settings_status() from public, anon;
grant execute on function payment_settings_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Writes. Each is admin-checked and writes its audit row in the same
-- transaction. They receive CIPHERTEXT only — encryption happens in the app.
-- ---------------------------------------------------------------------------
create or replace function save_payment_secret_key(
  p_mode text, p_ciphertext text, p_last4 text, p_kind text,
  p_account_id text, p_account_name text, p_ip_hash text
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
  if p_mode not in ('test', 'live') or coalesce(p_ciphertext, '') = '' then
    raise exception 'Invalid payment credential.';
  end if;

  insert into public.payment_credentials as c
    (mode, secret_key_ct, secret_key_last4, secret_key_kind,
     stripe_account_id, stripe_account_name, verified_at, updated_by, updated_at)
  values
    (p_mode, p_ciphertext, p_last4, p_kind,
     p_account_id, p_account_name, now(), auth.uid(), now())
  on conflict (mode) do update
    set secret_key_ct       = excluded.secret_key_ct,
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

create or replace function save_payment_webhook_secret(
  p_mode text, p_ciphertext text, p_last4 text, p_ip_hash text
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
  if p_mode not in ('test', 'live') or coalesce(p_ciphertext, '') = '' then
    raise exception 'Invalid payment credential.';
  end if;

  insert into public.payment_credentials as c
    (mode, webhook_secret_ct, webhook_secret_last4, updated_by, updated_at)
  values (p_mode, p_ciphertext, p_last4, auth.uid(), now())
  on conflict (mode) do update
    set webhook_secret_ct    = excluded.webhook_secret_ct,
        webhook_secret_last4 = excluded.webhook_secret_last4,
        updated_by           = auth.uid(),
        updated_at           = now();

  insert into public.payment_settings_audit (actor, action, mode, detail, ip_hash)
  values (auth.uid(), 'save_webhook_secret', p_mode,
          'webhook secret ending ' || coalesce(p_last4, '?'), p_ip_hash);
end;
$$;
revoke all on function save_payment_webhook_secret(text, text, text, text) from public, anon;
grant execute on function save_payment_webhook_secret(text, text, text, text) to authenticated;

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
   where mode = p_mode and secret_key_ct is not null;
  if not found then
    raise exception 'No % key is saved yet.', p_mode;
  end if;

  insert into public.payment_settings_audit (actor, action, mode, detail, ip_hash)
  values (auth.uid(), 'verify', p_mode,
          'verified' || coalesce(' · account ' || p_account_id, ''), p_ip_hash);
end;
$$;
revoke all on function record_payment_verification(text, text, text, text) from public, anon;
grant execute on function record_payment_verification(text, text, text, text) to authenticated;

-- Switching to Live requires a saved, verified live key — enforced here, not
-- just by the disabled button.
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
     where mode = 'live' and secret_key_ct is not null and verified_at is not null
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
revoke all on function set_payment_mode(text, text) from public, anon;
grant execute on function set_payment_mode(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Every admin is told about any change, so a rogue change can't go unnoticed.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.payment_credentials_changed','Stripe keys changed','An admin saved or re-verified Stripe credentials.','admin','All admins','{admin_name,mode,what}',940),
  ('admin.payment_mode_changed','Payment mode changed','An admin switched payments between Test and Live.','admin','All admins','{admin_name,mode}',941)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body) values
  ('admin.payment_credentials_changed', 'in_app', 'Stripe keys changed',
   '{{admin_name}} changed the {{mode}} Stripe {{what}}. If this wasn''t expected, check Payment settings now.'),
  ('admin.payment_credentials_changed', 'email', 'Stripe keys changed · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{admin_name}} changed the {{mode}} Stripe {{what}} in Payment settings. If you weren''t expecting this, check the screen and its change log now.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team'),
  ('admin.payment_mode_changed', 'in_app', 'Payment mode changed',
   '{{admin_name}} switched payments to {{mode}} mode.'),
  ('admin.payment_mode_changed', 'email', 'Payment mode changed · Live·En·Synergy',
   'Hi {{user_name}},' || chr(10) || chr(10) ||
   '{{admin_name}} switched payments to {{mode}} mode in Payment settings. If you weren''t expecting this, check the screen and its change log now.' || chr(10) || chr(10) ||
   '— The Live·En·Synergy team')
on conflict (event_key, channel) do nothing;
