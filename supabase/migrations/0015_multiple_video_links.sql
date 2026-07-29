-- =============================================================================
-- Live-En-Synergy — multiple showcase video links
--
-- Aligned 29 Jul: a profile should carry several video links rather than one.
-- YouTube and Vimeo are embedded inline on the public profile; anything else
-- renders as a plain link, and the forms say so.
--
-- `video_url` is kept rather than dropped so existing rows keep working while
-- the array fills in — `videoList()` in src/lib/video-embeds.ts falls back to
-- it when the array is empty.
-- =============================================================================

alter table artists           add column video_urls text[];
alter table brands            add column video_urls text[];
alter table event_organisers  add column video_urls text[];

comment on column artists.video_urls is
  'Showcase video links. YouTube/Vimeo embed inline; others render as links. Supersedes video_url, which is retained as a fallback for older rows.';
