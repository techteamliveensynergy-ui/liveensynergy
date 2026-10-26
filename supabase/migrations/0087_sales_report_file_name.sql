-- 0087 — keep the original name of an artist's sales-report evidence (GitHub #51).
--
-- Private uploads are stored as {profileId}/{purpose}/{uuid}.{ext}, so a
-- signed link downloads as "3f2a…c9.pdf" unless the original name is passed
-- along. Chat messages have kept it since 0008 (attachment_name); sales
-- reports never did. New rows record it on upload; older rows download as
-- "ticket-sales-report.<ext>".
--
-- Additive. Apply before deploying the code: submitting a report writes the
-- column, so the new build fails that insert on a database without it.

alter table ticket_sales_reports
  add column if not exists report_file_name text;
