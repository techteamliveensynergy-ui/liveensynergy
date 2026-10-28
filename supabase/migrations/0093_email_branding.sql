-- =============================================================================
-- 0093 — admin-editable email branding (GitHub #66).
--
-- Every email is wrapped by one layout (src/lib/email/layout.ts) with a
-- hard-coded colour bar, wordmark, system font and footer line. Admins could
-- already edit each email's text (notification_templates) but not the wrapper.
--
-- One row (id is always true): logo, header colours, one of four email-safe
-- font stacks, footer text. Every column is optional — an empty value means
-- "today's default" — so a missing row, a half-filled one, or a failed read
-- at drain time all render the current design and mail never fails because
-- of branding (notify() never-throws rule).
--
-- Admins read and write it under RLS; the outbox drain reads it with the
-- service client once per batch. The layout escapes the footer, so it can't
-- inject markup or links.
--
-- Additive: one new table. The code tolerates it missing.
-- =============================================================================

create table if not exists email_branding (
  id           boolean primary key default true check (id),
  logo_url     text check (logo_url is null or logo_url ~ '^https://'),
  header_bg    text check (header_bg is null or header_bg ~ '^#[0-9a-fA-F]{6}$'),
  header_text  text check (header_text is null or header_text ~ '^#[0-9a-fA-F]{6}$'),
  font         text check (font is null or font in ('system', 'arial', 'georgia', 'verdana')),
  footer_text  text check (footer_text is null or length(footer_text) <= 1000),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references profiles (id) on delete set null
);

alter table email_branding enable row level security;

drop policy if exists "email_branding: admin read" on email_branding;
create policy "email_branding: admin read" on email_branding for select using (is_admin());
drop policy if exists "email_branding: admin insert" on email_branding;
create policy "email_branding: admin insert" on email_branding for insert with check (is_admin());
drop policy if exists "email_branding: admin update" on email_branding;
create policy "email_branding: admin update" on email_branding for update using (is_admin()) with check (is_admin());

revoke all on email_branding from anon;
grant select, insert, update on email_branding to authenticated;
