-- =============================================================================
-- Are migrations 0104 to 0113 reflected in this database?
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
--   0109_survey_requires_account.sql (a survey response needs an account - no anonymous submit)
--   0110_artist_nudges.sql (admin "Nudge artist" reminders: log table + notification event)
--   0111_survey_own_response_and_completions.sql (survey-link responses visible: own-response RPC + completions view)
--   0112_notification_links_and_survey_review.sql (links on emails; review notifications to admin + respondent)
--   0113_email_button_settings.sql (admins choose which emails carry the action button)
--   0114 / 0115 (groups K, L) and 0116_marketing_campaigns.sql (group M: marketing email)
--   0117_testing_notes_0711.sql (group N: Testing notes 7 Nov)
--   0118_suggest_events_before_payment.sql (group O: events suggested before payment)
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
                and proname = 'survey_responses_require_verified_email'), false)::text),

  -- ---- F. 0109: a survey response needs an account ---------------------------------
  ('F. 0109 survey needs an account', 1, 'submit_public_survey_response() refuses a signed-out caller', 'true',
     coalesce((select bool_and(pg_get_functiondef(p.oid) like '%Please sign in or create an account to answer this survey.%')
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname = 'submit_public_survey_response'), false)::text),
  ('F. 0109 survey needs an account', 2, 'it is still SECURITY DEFINER', 'true',
     coalesce((select bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace
                and proname = 'submit_public_survey_response'), false)::text),

  -- ---- G. 0110: Nudge artist -----------------------------------------------------
  ('G. 0110 nudge artist', 1, 'artist_nudges table exists with row level security on', 'true',
     coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.artist_nudges')), false)::text),
  ('G. 0110 nudge artist', 2, 'admin-only policy', '1',
     (select count(*) from pg_policy where polrelid = to_regclass('public.artist_nudges')
        and polname = 'artist_nudges: admin all')::text),
  ('G. 0110 nudge artist', 3, 'notification event + settings + 2 templates', '1/1/2',
     (select count(*) from public.notification_events    where key = 'sponsorship.artist_nudge')::text || '/' ||
     (select count(*) from public.notification_settings  where event_key = 'sponsorship.artist_nudge')::text || '/' ||
     (select count(*) from public.notification_templates where event_key = 'sponsorship.artist_nudge')::text),

  -- ---- H. 0111: survey-link responses are visible --------------------------------
  ('H. 0111 survey-link responses', 1, 'my_survey_response() exists, SECURITY DEFINER', 'true',
     coalesce((select bool_and(prosecdef) from pg_proc where pronamespace = 'public'::regnamespace
                and proname = 'my_survey_response'), false)::text),
  ('H. 0111 survey-link responses', 2, 'signed-out cannot call it; signed-in can', 'false/true',
     coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' ||
                      has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname = 'my_survey_response' limit 1), 'missing')),
  ('H. 0111 survey-link responses', 3, 'completions view also matches respondent_profile_id', 'true',
     coalesce((select pg_get_viewdef(to_regclass('public.sponsored_event_survey_completions')) like '%respondent_profile_id%'), false)::text),

  -- ---- I. 0112: links on emails + review notifications ---------------------------
  ('I. 0112 notification links + review', 1, 'email_outbox.link exists', '1',
     (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'email_outbox' and column_name = 'link')::text),
  ('I. 0112 notification links + review', 2, 'enqueue_notification() stores the link on the email row', 'true',
     coalesce((select bool_and(pg_get_functiondef(p.oid) like '%status, link)%')
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname = 'enqueue_notification'), false)::text),
  ('I. 0112 notification links + review', 3, '3 events + 3 settings + 6 templates', '3/3/6',
     (select count(*) from public.notification_events where key in ('admin.survey_needs_review','survey.under_review','survey.review_declined'))::text || '/' ||
     (select count(*) from public.notification_settings where event_key in ('admin.survey_needs_review','survey.under_review','survey.review_declined'))::text || '/' ||
     (select count(*) from public.notification_templates where event_key in ('admin.survey_needs_review','survey.under_review','survey.review_declined'))::text),
  ('I. 0112 notification links + review', 4, 'three review triggers on survey_responses', '3',
     (select count(*) from pg_trigger where not tgisinternal and tgrelid = to_regclass('public.survey_responses')
        and tgname in ('survey_responses_review_notify_insert', 'survey_responses_review_notify_update',
                       'survey_responses_review_declined'))::text),

  -- ---- J. 0113: email button is an admin choice ----------------------------------
  ('J. 0113 email button settings', 1, 'notification_settings.email_button + email_button_label exist', '2',
     (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'notification_settings' and column_name in ('email_button', 'email_button_label'))::text),
  ('J. 0113 email button settings', 2, 'the review alert has its button on by default', 'true',
     coalesce((select to_jsonb(s) ->> 'email_button' from public.notification_settings s
                where s.event_key = 'admin.survey_needs_review'), 'missing')),

  -- ---- K. 0114: cancellation, listing guards, survey cut-offs, codes out, cap ---------
  ('K. 0114 event safety', 1, 'new sponsored_events / event_listings columns', '5',
     (select count(*) from information_schema.columns where table_schema = 'public'
        and ((table_name = 'sponsored_events' and column_name in ('cancelled_at','cancelled_by','cancel_reason','registration_cap'))
          or (table_name = 'event_listings' and column_name = 'archived_at')))::text),
  ('K. 0114 event safety', 2, 'new tables', '3',
     (select count(*) from information_schema.tables where table_schema = 'public'
        and table_name in ('sponsored_event_cancellation_requests','event_waitlist','reward_code_outages'))::text),
  ('K. 0114 event safety', 3, 'guard / gate / waitlist / outage triggers', '11',
     (select count(*) from pg_trigger where not tgisinternal and tgname in (
        'sponsored_events_cancel_guard','event_listings_deal_guard','reward_codes_block_cancelled',
        'participations_cap_guard','participations_promote_on_delete','participations_promote_on_reject',
        'sponsored_events_promote_on_cap','reward_codes_outage_check','reward_code_pool_outage_check',
        'reward_tiers_outage_check','survey_responses_require_open'))::text),
  ('K. 0114 event safety', 4, 'survey gate knows SURVEY_ENDED', 'true',
     coalesce((select pg_get_functiondef(p.oid) like '%SURVEY_ENDED%' from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = 'survey_responses_require_open'), false)::text),
  ('K. 0114 event safety', 5, 'admin_cancel_sponsored_event: signed-out no, signed-in yes', 'false/true',
     coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE')::text || '/' ||
                      has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname = 'admin_cancel_sponsored_event' limit 1), 'missing')),
  ('K. 0114 event safety', 6, 'promote_event_waitlist not callable by clients', 'false',
     coalesce((select has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
                 from pg_proc p where p.pronamespace = 'public'::regnamespace
                  and p.proname = 'promote_event_waitlist' limit 1), 'missing')),
  ('K. 0114 event safety', 7, '9 events + 9 settings + 18 templates', '9/9/18',
     (select count(*) from public.notification_events where key in ('admin.cancellation_requested','sponsorship.cancellation_declined','sponsorship.cancelled','participation.event_cancelled','admin.codes_ran_out','sponsorship.codes_ran_out','brand.codes_ran_out','participation.waitlisted','participation.promoted'))::text || '/' ||
     (select count(*) from public.notification_settings where event_key in ('admin.cancellation_requested','sponsorship.cancellation_declined','sponsorship.cancelled','participation.event_cancelled','admin.codes_ran_out','sponsorship.codes_ran_out','brand.codes_ran_out','participation.waitlisted','participation.promoted'))::text || '/' ||
     (select count(*) from public.notification_templates where event_key in ('admin.cancellation_requested','sponsorship.cancellation_declined','sponsorship.cancelled','participation.event_cancelled','admin.codes_ran_out','sponsorship.codes_ran_out','brand.codes_ran_out','participation.waitlisted','participation.promoted'))::text),
  ('K. 0114 event safety', 8, 'waitlist size: cap 30 → 3, cap 31 → 4', '3/4',
     coalesce((select public.event_waitlist_size(30)::text || '/' || public.event_waitlist_size(31)::text), 'missing')),

  -- ---- L. 0115: change-request decisions, brand reports, brand files, blank answers --
  ('L. 0115 brand + decisions', 1, 'new functions exist', '6',
     (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('admin_resolve_change_request','admin_share_analysis_report','brand_analysis_reports',
                        'brand_analysis_report','can_read_brand_files','is_my_brand_campaign'))::text),
  ('L. 0115 brand + decisions', 2, 'none callable signed-out', '0',
     (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
        and p.proname in ('admin_resolve_change_request','admin_share_analysis_report','brand_analysis_reports',
                          'brand_analysis_report','can_read_brand_files','is_my_brand_campaign')
        and has_function_privilege('anon', p.oid, 'EXECUTE'))::text),
  ('L. 0115 brand + decisions', 3, 'analysis_reports.shared_with_brand_at + brand_files table', '2',
     ((select count(*) from information_schema.columns where table_schema = 'public'
         and table_name = 'analysis_reports' and column_name = 'shared_with_brand_at')
      + (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'brand_files'))::text),
  ('L. 0115 brand + decisions', 4, 'partner storage policy on brand files', '1',
     (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'private-uploads: brand files for partners')::text),
  ('L. 0115 brand + decisions', 5, 'change-request notice says the decision', 'true',
     coalesce((select bool_or(body like '%{{status}}%') from public.notification_templates
                where event_key = 'sponsored.change_resolved'), false)::text),
  ('L. 0115 brand + decisions', 6, 'required questions refuse blank text', 'true',
     coalesce((select pg_get_functiondef(p.oid) like '%btrim(v_val%' from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = 'validate_survey_answer_types'), false)::text),

  -- ---- M. 0116: marketing email (subscriptions, campaigns, sends) ----------
  ('M. 0116 marketing', 1, 'tables exist', '6',
     (select count(*) from information_schema.tables where table_schema = 'public'
        and table_name in ('brand_subscriptions','marketing_suppressions','brand_marketing_settings',
                           'marketing_campaigns','marketing_sends','marketing_webhook_events'))::text),
  ('M. 0116 marketing', 2, 'functions exist', '11',
     (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('marketing_sync_subscription','marketing_unsubscribe','marketing_unsubscribe_state','marketing_eligible',
                        'marketing_audience_count','marketing_start_campaign','marketing_claim_batch','marketing_complete_batch',
                        'marketing_fail_batch','marketing_apply_event','marketing_check_health'))::text),
  ('M. 0116 marketing', 3, 'only the audience count is callable by signed-in users', 'marketing_audience_count',
     coalesce((select string_agg(p.proname, ',' order by p.proname) from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname like 'marketing\_%'
                  and (has_function_privilege('anon', p.oid, 'EXECUTE')
                       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))), 'none')),
  ('M. 0116 marketing', 4, 'opt-in ticks backfilled into subscriptions', 'true',
     (not exists (select 1 from public.participations pa join public.sponsored_events se on se.id = pa.sponsored_event_id
                   where pa.newsletter_opt_in
                     and not exists (select 1 from public.brand_subscriptions bs
                                      where bs.profile_id = pa.audience_profile_id and bs.brand_id = se.brand_id)))::text),
  ('M. 0116 marketing', 5, 'consent log accepts unsubscribe sources', 'true',
     coalesce((select bool_or(pg_get_constraintdef(c.oid) like '%one_click_unsubscribe%') from pg_constraint c
                where c.conrelid = 'public.consent_records'::regclass and c.contype = 'c'), false)::text),
  ('M. 0116 marketing', 6, 'auto-pause notification seeded', '1',
     (select count(*) from public.notification_events where key = 'admin.marketing_paused')::text),

  -- ---- N. 0117: Testing notes 7 Nov ----------------------------------------
  ('N. 0117 testing notes', 1, 'new columns (request package/audience, order form post-survey link)', '5',
     (select count(*) from information_schema.columns where table_schema = 'public'
        and ((table_name = 'campaign_intake_requests' and column_name in ('package_id','audience_age_min','audience_age_max','audience_criteria'))
          or (table_name = 'campaign_order_forms' and column_name = 'post_survey_link')))::text),
  ('N. 0117 testing notes', 2, 'survey preview + profile live events functions', '2',
     (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('order_form_survey_preview','public_profile_live_events'))::text),
  ('N. 0117 testing notes', 3, 'order form preview not callable signed-out', 'false',
     coalesce((select bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = 'order_form_survey_preview'), false)::text),
  ('N. 0117 testing notes', 4, 'reset email carries a link', 'true',
     coalesce((select body ~ '\{\{\s*(reset_link|link)\s*\}\}' from public.notification_templates
                where event_key = 'account.password_reset' and channel = 'email'), false)::text),
  ('N. 0117 testing notes', 5, 'artist emails no longer quote the package value', '0',
     (select count(*) from public.notification_templates
       where event_key in ('sponsorship.confirmed','offer.proposal_received') and body like '%{{budget}}%')::text),

  -- ---- O. 0118: suggest events before payment -----------------------------
  ('O. 0118 suggest before payment', 1, 'functions + triggers exist', '5',
     ((select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('sponsored_event_campaign_unpaid','campaign_paid_reveal_suggestions','sponsored_event_artist_waits_for_payment'))
      + (select count(*) from pg_trigger where not tgisinternal
           and tgname in ('sponsored_events_artist_waits_for_payment','campaigns_paid_reveal_suggestions')))::text),
  ('O. 0118 suggest before payment', 2, 'party policy hides unpaid suggestions from the artist', 'true',
     coalesce((select qual like '%sponsored_event_campaign_unpaid%' from pg_policies
                where schemaname = 'public' and tablename = 'sponsored_events' and policyname = 'sponsored_events: parties or admin'), false)::text),
  ('O. 0118 suggest before payment', 3, 'unpaid check not callable signed-out', 'false',
     coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = 'sponsored_event_campaign_unpaid'), true)::text),
  ('O. 0118 suggest before payment', 4, 'order form event capacity + link columns', '2',
     (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'campaign_order_forms' and column_name in ('event_capacity','event_link'))::text),

  -- ---- P. 0119: one partner-marketing choice for all brands ----------------
  ('P. 0119 partner marketing', 1, 'flag column exists', '1',
     (select count(*) from information_schema.columns where table_schema = 'public'
        and table_name = 'audience_members' and column_name = 'partner_marketing_all')::text),
  ('P. 0119 partner marketing', 2, 'function + inherit trigger exist', '2',
     (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace
         and proname in ('set_partner_marketing_all','participations_inherit_partner_marketing'))::text),
  ('P. 0119 partner marketing', 3, 'inherit trigger is attached', '1',
     (select count(*) from pg_trigger where not tgisinternal and tgname = 'participations_inherit_partner_marketing')::text),
  ('P. 0119 partner marketing', 4, 'switch not callable signed-out', 'false',
     coalesce((select has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p
                where p.pronamespace = 'public'::regnamespace and p.proname = 'set_partner_marketing_all'), true)::text),
  ('P. 0119 partner marketing', 5, 'unsubscribe-all clears the flag', 'true',
     coalesce((select prosrc like '%partner_marketing_all = false%' from pg_proc
                where pronamespace = 'public'::regnamespace and proname = 'marketing_unsubscribe'), false)::text)
)
select grp as "group", name as "check", expected, actual,
       case when expected = actual then 'PASS' else 'FAIL' end as result
  from checks
 order by grp, ord;
