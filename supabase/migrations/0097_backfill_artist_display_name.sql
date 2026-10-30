-- =============================================================================
-- 0097 — store the act's name on admin-matched partnerships (QA 30 Oct #7).
--
-- matchCampaign never set sponsored_events.artist_display_name, so "Artist /
-- act" fell back to the listing's event name. The code now sets it on new
-- matches; this fills the existing rows from the artist's stage/artist name
-- (organiser name for pre-merge `event` accounts) — the same order
-- public_event_page() uses (0095). Data only; runs as the owner, so the 0061
-- guard lets it through. Rows that already have a name are left alone.
-- Re-runnable.
-- =============================================================================

update sponsored_events se
   set artist_display_name = coalesce(nullif(a.stage_name, ''), nullif(a.artist_name, ''), nullif(o.event_name, ''))
  from profiles p
  left join artists a          on a.profile_id = p.id
  left join event_organisers o on o.profile_id = p.id
 where p.id = se.artist_profile_id
   and nullif(se.artist_display_name, '') is null
   and coalesce(nullif(a.stage_name, ''), nullif(a.artist_name, ''), nullif(o.event_name, '')) is not null;
