-- =============================================================================
-- Live-En-Synergy — admin: plans, subscriptions, and user management columns
-- =============================================================================

-- ---------------------------------------------------------------------------
-- plans — subscription tiers the admin can manage and assign to users
-- ---------------------------------------------------------------------------
create table plans (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  description       text,
  price_gbp         numeric(10, 2) not null default 0,
  billing_interval  text not null default 'month', -- month | year | one_off | free
  features          text[],
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger plans_set_updated_at before update on plans
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- profiles — user-management columns
-- ---------------------------------------------------------------------------
alter table profiles
  add column email     text,
  add column is_active boolean not null default true,
  add column plan_id   uuid references plans (id) on delete set null;

-- Capture the email on sign-up so admins can manage users by email.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'audience'),
    new.raw_user_meta_data ->> 'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill emails for any existing users.
update profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- ---------------------------------------------------------------------------
-- RLS for plans
-- ---------------------------------------------------------------------------
alter table plans enable row level security;

create policy "plans: read active or admin"
  on plans for select
  using (is_active or is_admin());

create policy "plans: admin manage"
  on plans for all
  using (is_admin())
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- Seed default plans (from the concept: free / community tiers, etc.)
-- ---------------------------------------------------------------------------
insert into plans (slug, name, description, price_gbp, billing_interval, features, sort_order)
values
  ('free', 'Free', 'Get started and explore the platform.', 0, 'free',
   array['Create a profile', 'Browse events', 'Community access'], 1),
  ('community', 'Community', 'For active artists and organisers.', 19, 'month',
   array['Everything in Free', 'List unlimited events', 'Sponsor matching', 'Direct chat'], 2),
  ('pro', 'Pro', 'For brands running regular campaigns.', 49, 'month',
   array['Everything in Community', 'Unlimited campaigns', 'Priority matching', 'Analytics'], 3)
on conflict (slug) do nothing;
