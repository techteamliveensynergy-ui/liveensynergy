-- =============================================================================
-- Live-En-Synergy — file storage
--
-- Two buckets, split by who is allowed to see the file:
--
--   media           public read. Profile/banner images, event and campaign
--                   artwork, sponsored-event banners and branding creatives —
--                   all of it is meant to be seen by other users anyway.
--
--   private-uploads no public read. Chat attachments, feedback screenshots and
--                   ticket proofs. Served through short-lived signed URLs
--                   generated server-side (see src/lib/storage.ts).
--
-- Writes in both buckets are namespaced under the uploader's profile id, so a
-- user can never overwrite someone else's object.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 5242880,
   array['image/jpeg','image/png','image/webp','image/gif','image/avif']),
  ('private-uploads', 'private-uploads', false, 26214400, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- media — world-readable, owner-writable
-- ---------------------------------------------------------------------------
create policy "media: public read"
  on storage.objects for select
  using (bucket_id = 'media');

create policy "media: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media: owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- private-uploads — owner (or admin) read, owner write
-- ---------------------------------------------------------------------------
create policy "private-uploads: owner or admin read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'private-uploads'
    -- Schema-qualified: storage policies don't run with `public` on the
    -- search_path, so a bare is_admin() would not resolve.
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "private-uploads: owner insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'private-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "private-uploads: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'private-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
