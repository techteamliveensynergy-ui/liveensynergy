-- =============================================================================
-- Live-En-Synergy — several categories on a brand's campaign request
--
-- 13 Oct client notes: "Can brands select multiple categories of events?"
-- campaign_intake_requests.category was a single value. `categories` holds
-- every category the brand ticked; `category` is kept and always written as
-- the first of them, so everything that already reads it (the admin's
-- "convert to campaign" prefill, list subtitles) keeps working unchanged. A
-- campaign itself keeps one category — the admin picks it on conversion.
--
-- Additive + defaulted, so the running build is unaffected. The backfill
-- copies each existing request's single category into the new array, so a
-- pre-existing request reads the same in the new views as it did before (L4).
-- The brand's existing owner policies cover the new column; nothing else
-- changes.
-- =============================================================================

alter table campaign_intake_requests
  add column if not exists categories text[] not null default '{}';

update campaign_intake_requests
   set categories = array[category]
 where category is not null
   and categories = '{}';
