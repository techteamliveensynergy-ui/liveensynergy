-- =============================================================================
-- Are migrations 0104, 0105, 0106, 0107 and 0108 reflected in this database?
--
-- READ-ONLY. Paste the whole file into the Supabase SQL editor on the project
-- you want to check (dev, then production). It returns one row per expected
-- change: PASS or FAIL. Expected values are taken from the migration files on
-- `main`:
--   0104_fulfilment_forms.sql      (PR #90: the artist fulfilment form)
--   0105_survey_quota_alert.sql    (survey quota stage: admin alert at 100%)
--   0106_listings_signed_in_only.sql (event listings no longer public)
--   0107_fulfilment_consent_and_grants.sql (consent-log constraints + a grant fix)
--   0108_survey_requires_verified_email.sql (a survey response needs a verified email)
--
-- Reading the result:
--   - every row PASS                -> all three are applied.
--   - a whole group FAIL            -> that migration isn't applied yet.
--   - B.6 / B.7-B.9 FAIL           -> apply 0107_fulfilment_consent_and_grants.sql.
--   - group "A. Removed 0103" FAIL  -> the old, withdrawn 0103 was applied here;
--                                      it clashes with 0104. Tell me before
--                                      doing anything else.
-- =============================================================================
with checks (grp, ord, name, expected, actual) as (
  values
  -- ---- A. The withdrawn 0103 must NOT be here (it conflicts with 0104) ------
  ('A. Removed 0103', 1, 'no artist_invoices table',                'true',
     (to_regclass('public.artist_invoices') is null)::text),
  ('A. Removed 0103', 2, 'no completed_at / completion_kind columns on the fulfilment table', '0',
     (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'sponsored_event_fulfilment'
         and column_name in ('completed_at', 'completion_kind', 'payment_terms', 'proof_requirements'))::text),
  ('A. Removed 0103', 3, 'no sponsored_event_fulfilled() function', '0',
     (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('sponsored_event_fulfilled', 'submit_artist_fulfilment', 'confirm_promotion_terms',
                        'admin_set_fulfilment', 'sponsored_events_waiting_fulfilment'))::text),

  -- ---- B. 0104: the fulfilment form -----------------------------------------
  ('B. 0104 fulfilment form', 1, 'table sponsored_event_fulfilment exists', 'true',
     (to_regclass('public.sponsored_event_fulfilment') is not null)::text),
  ('B. 0104 fulfilment form', 2, 'its 14 columns (incl. ready_at, artist_ack_at)', '14',
     (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'sponsored_event_fulfilment'
         and column_name in ('sponsored_event_id','promo_channels','promo_post_count','promo_social_urls',
                             'promo_start_date','promo_post_texts','promo_other','special_terms','ready_at',
                             'ready_by','artist_ack_at','created_at','updated_at','updated_by'))::text),
  ('B. 0104 fulfilment form', 3, 'row level security is on', 'true',
     coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.sponsored_event_fulfilment')), false)::text),
  ('B. 0104 fulfilment form', 4, 'two policies (admin all, artist reads when ready)', '2',
     (select count(*) from pg_policy where polrelid = to_regclass('public.sponsored_event_fulfilment')
        and polname in ('sponsored_event_fulfilment: admin all', 'sponsored_event_fulfilment: artist reads when ready'))::text),
  ('B. 0104 fulfilment form', 5, 'acknowledge_fulfilment_form() exists and is SECURITY DEFINER', 'true',
     coalesce((select bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace
                and proname = 'acknowledge_fulfilment_form'), false)::text),
  ('B. 0104 fulfilment form', 6, 'signed-out users cannot call it; signed-in can', 'false/true',
     coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' ||
                      has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname = 'acknowledge_fulfilment_form' limit 1), 'missing')),
  ('B. 0104 fulfilment form', 7, 'consent_type check allows fulfilment_commitments, fulfilment_terms, order_form_documents', 'true',
     coalesce((select bool_and(pg_get_constraintdef(oid) like '%fulfilment_commitments%'
                           and pg_get_constraintdef(oid) like '%fulfilment_terms%'
                           and pg_get_constraintdef(oid) like '%order_form_documents%')
                 from pg_constraint where conrelid = to_regclass('public.consent_records') and contype = 'c'
                  and pg_get_constraintdef(oid) ~ '\mconsent_type\M'), false)::text),
  ('B. 0104 fulfilment form', 8, 'source check allows fulfilment_form', 'true',
     coalesce((select bool_and(pg_get_constraintdef(oid) like '%fulfilment_form%')
                 from pg_constraint where conrelid = to_regclass('public.consent_records') and contype = 'c'
                  and pg_get_constraintdef(oid) ~ '\msource\M'), false)::text),
  ('B. 0104 fulfilment form', 9, 'exactly one check on consent_type and one on source (no stale leftover)', '2',
     (select count(*) from pg_constraint where conrelid = to_regclass('public.consent_records') and contype = 'c')::text),
  ('B. 0104 fulfilment form', 10, 'two triggers (updated_at, consent records)', '2',
     (select count(*) from pg_trigger where not tgisinternal
        and tgrelid = to_regclass('public.sponsored_event_fulfilment')
        and tgname in ('sponsored_event_fulfilment_set_updated_at', 'sponsored_event_fulfilment_consent_records'))::text),
  ('B. 0104 fulfilment form', 11, '8 notification events', '8',
     (select count(*) from public.notification_events where key in (
        'fulfilment.form_ready','fulfilment.form_updated','fulfilment.acknowledged','fulfilment.proof_received',
        'admin.fulfilment_ready','admin.fulfilment_updated','admin.fulfilment_acknowledged','admin.proof_reviewed'))::text),
  ('B. 0104 fulfilment form', 12, '8 notification settings rows', '8',
     (select count(*) from public.notification_settings where event_key in (
        'fulfilment.form_ready','fulfilment.form_updated','fulfilment.acknowledged','fulfilment.proof_received',
        'admin.fulfilment_ready','admin.fulfilment_updated','admin.fulfilment_acknowledged','admin.proof_reviewed'))::text),
  ('B. 0104 fulfilment form', 13, '16 templates (in-app + email for each)', '16',
     (select count(*) from public.notification_templates where event_key in (
        'fulfilment.form_ready','fulfilment.form_updated','fulfilment.acknowledged','fulfilment.proof_received',
        'admin.fulfilment_ready','admin.fulfilment_updated','admin.fulfilment_acknowledged','admin.proof_reviewed'))::text),

  -- ---- C. 0105: survey quota alert -------------------------------------------
  ('C. 0105 survey quota alert', 1, 'survey_templates.quota_alert_sent_at exists', '1',
     (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'survey_templates' and column_name = 'quota_alert_sent_at')::text),
  ('C. 0105 survey quota alert', 2, 'two triggers (alert on insert, reset on target change)', '2',
     (select count(*) from pg_trigger where not tgisinternal
        and tgname in ('survey_responses_quota_alert', 'survey_templates_reset_quota_alert'))::text),
  ('C. 0105 survey quota alert', 3, 'survey_quota_alert() is SECURITY DEFINER', 'true',
     coalesce((select bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace
                and proname = 'survey_quota_alert'), false)::text),
  ('C. 0105 survey quota alert', 4, 'notification event + settings + 2 templates', '1/1/2',
     (select count(*) from public.notification_events    where key = 'admin.survey_quota_reached')::text || '/' ||
     (select count(*) from public.notification_settings  where event_key = 'admin.survey_quota_reached')::text || '/' ||
     (select count(*) from public.notification_templates where event_key = 'admin.survey_quota_reached')::text),
  ('C. 0105 survey quota alert', 5, 'backfill: no survey already over quota is left un-stamped', '0',
     coalesce((select count(*)
        from public.survey_templates t
        left join public.campaign_order_forms f on f.campaign_id = t.campaign_id
       -- to_jsonb(t) instead of t.quota_alert_sent_at: still runs (and reports
       -- FAIL below) on a database where 0105 hasn't added the column yet.
       where to_jsonb(t) ->> 'quota_alert_sent_at' is null
         and coalesce(t.expected_participants, f.approx_participants) is not null
         and (select count(*) from public.survey_responses r
               where r.template_id = t.id and r.quality_status <> 'reject')
             >= coalesce(t.expected_participants, f.approx_participants)), 0)::text),

  -- ---- D. 0106: listings no longer public --------------------------------------
  ('D. 0106 listings signed-in only', 1, 'old public-read policy is gone', '0',
     (select count(*) from pg_policy where polrelid = to_regclass('public.event_listings')
        and polname = 'event_listings: public read available')::text),
  ('D. 0106 listings signed-in only', 2, 'new policy exists and is for signed-in users only', '{authenticated}',
     coalesce((select polroles::regrole[]::text from pg_policy where polrelid = to_regclass('public.event_listings')
                and polname = 'event_listings: signed-in read available'), 'missing')
       ),

  -- ---- E. 0108: a survey response needs a verified email -------------------------
  ('E. 0108 verified email before a survey', 1, 'trigger survey_responses_require_verified_email exists', '1',
     (select count(*) from pg_trigger where not tgisinternal
        and tgrelid = to_regclass('public.survey_responses')
        and tgname = 'survey_responses_require_verified_email')::text),
  ('E. 0108 verified email before a survey', 2, 'its function is SECURITY DEFINER', 'true',
     coalesce((select bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace
                and proname = 'survey_responses_require_verified_email'), false)::text)
)
select grp as "group", name as "check", expected, actual,
       case when expected = actual then 'PASS' else 'FAIL' end as result
  from checks
 order by grp, ord;
