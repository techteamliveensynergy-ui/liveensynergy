-- =============================================================================
-- Live-En-Synergy — backfill audience_members.phone after the 0018 split
--
-- 0018 added `phone_country_code` (default '+44') and the UI started treating
-- `phone` as the LOCAL part only. Nothing rewrote the rows that already
-- existed, so their `phone` still carries the dialling code (or a national
-- trunk zero) and every consumer that joins the two — notably the admin CSV
-- export, which emits `${phone_country_code} ${phone}` — produced malformed
-- numbers like "+44 +44 7700 900123" or "+44 07775199436".
--
-- Data-only migration: no schema change, and written to be idempotent so a
-- second run is a no-op.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Collapse repeated whitespace so the prefix tests below are reliable.
-- ---------------------------------------------------------------------------
update audience_members
set phone = btrim(regexp_replace(phone, '\s+', ' ', 'g'))
where phone is not null
  and phone <> btrim(regexp_replace(phone, '\s+', ' ', 'g'));

-- ---------------------------------------------------------------------------
-- 2. Strip a leading copy of the row's own dialling code, with or without the
--    separating space ("+44 7700 900123" and "+447700900123" both become
--    "7700 900123" / "7700900123").
-- ---------------------------------------------------------------------------
update audience_members
set phone = btrim(substring(phone from length(phone_country_code) + 1))
where phone is not null
  and phone_country_code is not null
  and phone like phone_country_code || '%';

-- ---------------------------------------------------------------------------
-- 3. Drop a single national trunk zero, but ONLY for +44. Most European plans
--    drop the leading 0 when dialling internationally, but Italy (+39) keeps
--    it as part of the subscriber number — so this is deliberately narrow
--    rather than a blanket strip. Extend the list only per verified country.
-- ---------------------------------------------------------------------------
update audience_members
set phone = substring(phone from 2)
where phone is not null
  and phone_country_code = '+44'
  and phone like '0%';

-- ---------------------------------------------------------------------------
-- 4. Normalise anything that ended up empty back to null, so "no number" is
--    represented one way rather than as an empty string.
-- ---------------------------------------------------------------------------
update audience_members
set phone = null
where phone is not null
  and btrim(phone) = '';
