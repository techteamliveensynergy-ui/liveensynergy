-- =============================================================================
-- 0121 — Artist files + the artist's invoice choice (Testing notes 15–16 Nov:
-- "option to upload bank details and other docs for artists", "same for admin",
-- "fulfilment form to let the artist upload an invoice", "draft invoice option").
--
-- 1. artist_files — an artist's (or organiser's) own files in the Repository:
--    bank details, invoices, agreements, anything else. Private storage; the
--    artist and the team can open them, never the brand. The team can also add
--    a file for an artist (a contract, a draft invoice); the artist can open it
--    but can only delete what they uploaded themselves.
-- 2. artist_invoice_requests — "please draft the invoice for me", one per
--    partnership, so the team sees who is waiting for what.
-- 3. Notifications to the team (a file / an invoice arrived, a draft was
--    asked for) and to the artist (the team added a file).
--
-- Bank details are a FILE (a statement or letter), never typed into the
-- platform, so there are no account numbers in our tables.
--
-- Additive and re-runnable.
-- =============================================================================

create table if not exists public.artist_files (
  id                 uuid primary key default gen_random_uuid(),
  artist_profile_id  uuid not null references public.profiles (id) on delete cascade,
  uploaded_by        uuid not null references public.profiles (id) on delete cascade,
  kind               text not null default 'other' check (kind in ('bank_details', 'invoice', 'agreement', 'other')),
  title              text not null check (char_length(btrim(title)) between 1 and 200),
  description        text check (description is null or char_length(description) <= 1000),
  sponsored_event_id uuid references public.sponsored_events (id) on delete set null,
  file_path          text not null,
  file_name          text not null check (char_length(file_name) <= 255),
  content_type       text,
  size_bytes         bigint,
  created_at         timestamptz not null default now(),
  -- The object sits in its uploader's own artist-files folder (storage policy
  -- 0009 limits writes to one's own first folder).
  check (file_path like uploaded_by::text || '/artist-files/%')
);
create index if not exists artist_files_owner_idx on public.artist_files (artist_profile_id, created_at desc);
create index if not exists artist_files_event_idx on public.artist_files (sponsored_event_id) where sponsored_event_id is not null;

alter table public.artist_files enable row level security;
drop policy if exists "artist_files: admin" on public.artist_files;
create policy "artist_files: admin" on public.artist_files
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "artist_files: owner read" on public.artist_files;
create policy "artist_files: owner read" on public.artist_files
  for select using (artist_profile_id = auth.uid());
drop policy if exists "artist_files: owner insert" on public.artist_files;
create policy "artist_files: owner insert" on public.artist_files
  for insert with check (artist_profile_id = auth.uid() and uploaded_by = auth.uid());
drop policy if exists "artist_files: owner delete own upload" on public.artist_files;
create policy "artist_files: owner delete own upload" on public.artist_files
  for delete using (artist_profile_id = auth.uid() and uploaded_by = auth.uid());
grant select, insert, delete on public.artist_files to authenticated;
grant all on public.artist_files to service_role;

-- Storage: the artist can open a file the TEAM added for them (it sits in the
-- admin's folder). The table row decides; nobody else gets in.
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "private-uploads: artist files for the artist" on storage.objects;
    create policy "private-uploads: artist files for the artist" on storage.objects
      for select using (
        bucket_id = 'private-uploads'
        and (storage.foldername(name))[2] = 'artist-files'
        and exists (
          select 1 from public.artist_files f
           where f.file_path = storage.objects.name
             and f.artist_profile_id = auth.uid()));
  end if;
end $$;

-- 2. "Please draft my invoice" ---------------------------------------------------
create table if not exists public.artist_invoice_requests (
  sponsored_event_id uuid primary key references public.sponsored_events (id) on delete cascade,
  artist_profile_id  uuid not null references public.profiles (id) on delete cascade,
  requested_at       timestamptz not null default now(),
  handled_at         timestamptz
);
alter table public.artist_invoice_requests enable row level security;
drop policy if exists "artist_invoice_requests: admin" on public.artist_invoice_requests;
create policy "artist_invoice_requests: admin" on public.artist_invoice_requests
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "artist_invoice_requests: artist read" on public.artist_invoice_requests;
create policy "artist_invoice_requests: artist read" on public.artist_invoice_requests
  for select using (artist_profile_id = auth.uid());
drop policy if exists "artist_invoice_requests: artist insert" on public.artist_invoice_requests;
create policy "artist_invoice_requests: artist insert" on public.artist_invoice_requests
  for insert with check (
    artist_profile_id = auth.uid()
    and exists (select 1 from public.sponsored_events se
                 where se.id = sponsored_event_id and se.artist_profile_id = auth.uid()));
grant select, insert on public.artist_invoice_requests to authenticated;
grant all on public.artist_invoice_requests to service_role;

-- 3. Notifications ---------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('admin.artist_file_added', 'Artist uploaded a file',
   'An artist or organiser added a file (bank details, an invoice, an agreement) to their files.',
   'admin', 'The admins', '{artist_name,file_title,file_kind,event_name,reference}', 260),
  ('admin.invoice_draft_requested', 'Artist asked for an invoice draft',
   'An artist asked the team to draft their invoice for a partnership instead of uploading their own.',
   'admin', 'The admins', '{artist_name,event_name,reference}', 261),
  ('artist.file_from_team', 'The team added a file for you',
   'The team added a file to an artist''s files (a contract, a draft invoice).',
   'artist', 'The artist / organiser', '{user_name,file_title}', 262)
on conflict (key) do nothing;

insert into public.notification_settings (event_key)
select key from public.notification_events
 where key in ('admin.artist_file_added', 'admin.invoice_draft_requested', 'artist.file_from_team')
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select v.event_key, v.channel, v.subject, v.body
  from (values
    ('admin.artist_file_added', 'in_app', '{{artist_name}} added a file',
     '{{artist_name}} added {{file_title}} ({{file_kind}}). {{event_name}} {{reference}}'),
    ('admin.artist_file_added', 'email', '{{artist_name}} added a file · Live·En·Synergy',
     '{{artist_name}} added {{file_title}} ({{file_kind}}) to their files. {{event_name}} {{reference}}'),
    ('admin.invoice_draft_requested', 'in_app', '{{artist_name}} wants an invoice drafted',
     '{{artist_name}} asked the team to draft their invoice for {{event_name}} ({{reference}}).'),
    ('admin.invoice_draft_requested', 'email', '{{artist_name}} wants an invoice drafted · Live·En·Synergy',
     '{{artist_name}} asked the team to draft their invoice for {{event_name}} ({{reference}}).'),
    ('artist.file_from_team', 'in_app', 'The team added a file for you',
     'The Live·En·Synergy team added {{file_title}} to your files in the Repository.'),
    ('artist.file_from_team', 'email', 'A file for you · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'The Live·En·Synergy team added {{file_title}} to your files. Open Repository in your dashboard to view it.' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team')
  ) as v(event_key, channel, subject, body)
 where not exists (select 1 from public.notification_templates t where t.event_key = v.event_key and t.channel = v.channel);
