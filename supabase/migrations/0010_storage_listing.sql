-- =============================================================================
-- Live-En-Synergy — tighten the public media bucket
--
-- 0009 gave `media` a broad SELECT policy on storage.objects. A public bucket
-- doesn't need one: object URLs (/storage/v1/object/public/media/...) are
-- served without consulting RLS. All the policy actually bought was the
-- ability for any client to *list* every file in the bucket, which leaks the
-- full set of uploaded paths. Dropping it keeps images loading and stops the
-- enumeration.
-- =============================================================================

drop policy if exists "media: public read" on storage.objects;

-- Owners still need to see their own objects to manage/replace them.
create policy "media: owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
