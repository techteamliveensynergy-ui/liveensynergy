-- =============================================================================
-- 0125 — Campaign Order Form: a Data Protection Agreement box and one
-- attachment (Testing notes 15 Nov + 16 Nov standup: "COF to have 1 'Data
-- Protection Agreement' & 1 attachment field"; "file name changes when a file
-- is uploaded and shared").
--
--   dpa_details      free text the team writes (or pastes): the agreement or
--                    arrangement the brand is asked to be aware of.
--   attachment_*     ONE file the team attaches (a signed agreement, a PDF).
--                    Stored privately; the original file name is kept and used
--                    for the download, so it doesn't change when shared.
--
-- Shown to the brand once the form is sent (never in draft) and to admins;
-- never to the artist. Storage: the file sits in the uploading admin's folder
-- (storage policy 0009); a policy lets the form's brand open it, decided by
-- the table row.
--
-- Additive and re-runnable.
-- =============================================================================

alter table public.campaign_order_forms
  add column if not exists dpa_details     text,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_order_forms_dpa_len') then
    alter table public.campaign_order_forms
      add constraint campaign_order_forms_dpa_len check (dpa_details is null or char_length(dpa_details) <= 8000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_order_forms_attachment_name_len') then
    alter table public.campaign_order_forms
      add constraint campaign_order_forms_attachment_name_len check (attachment_name is null or char_length(attachment_name) <= 255);
  end if;
end $$;

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "private-uploads: order form attachment for the brand" on storage.objects;
    create policy "private-uploads: order form attachment for the brand" on storage.objects
      for select using (
        bucket_id = 'private-uploads'
        and (storage.foldername(name))[2] = 'order-form-files'
        and exists (
          select 1 from public.campaign_order_forms f
            join public.brands b on b.id = f.brand_id
           where f.attachment_path = storage.objects.name
             and f.status <> 'draft'
             and b.profile_id = auth.uid()));
  end if;
end $$;
