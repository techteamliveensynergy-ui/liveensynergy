-- =============================================================================
-- Which numbered migrations (0046 onwards) are in THIS database?
--
-- READ-ONLY. Paste into the Supabase SQL editor of the project you want to
-- check. One row per migration that creates something checkable, with
-- applied = true/false. Migrations that only change wording or policies have
-- no marker and aren't listed. Apply every `false` row's file in number order
-- (oldest first), then re-run this.
-- Generated from supabase/migrations; a marker is an object that migration
-- creates first.
-- =============================================================================
with m(migration, marker, applied) as (values
  ('0046_email_delivery.sql', 'table email_suppressions', to_regclass('public.email_suppressions') is not null),
  ('0047_billing_and_invoice_drafting.sql', 'column brands.billing_legal_name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='brands' and column_name='billing_legal_name')),
  ('0049_campaign_payment_gate.sql', 'column campaigns.payment_waived_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='payment_waived_at')),
  ('0050_payment_credentials.sql', 'table payment_credentials', to_regclass('public.payment_credentials') is not null),
  ('0051_invoice_status_tracking.sql', 'column invoices.resend_count', exists (select 1 from information_schema.columns where table_schema='public' and table_name='invoices' and column_name='resend_count')),
  ('0052_payment_credentials_vault.sql', 'column payment_credentials.secret_key_vault_id', exists (select 1 from information_schema.columns where table_schema='public' and table_name='payment_credentials' and column_name='secret_key_vault_id')),
  ('0053_stripe_invoicing.sql', 'table brand_stripe_customers', to_regclass('public.brand_stripe_customers') is not null),
  ('0054_campaign_order_forms.sql', 'table campaign_order_forms', to_regclass('public.campaign_order_forms') is not null),
  ('0055_invoice_contact_details_and_refunds.sql', 'table invoice_refunds', to_regclass('public.invoice_refunds') is not null),
  ('0056_survey_response_cap.sql', 'column survey_templates.expected_participants', exists (select 1 from information_schema.columns where table_schema='public' and table_name='survey_templates' and column_name='expected_participants')),
  ('0059_survey_results_stats.sql', 'table survey_template_stats', to_regclass('public.survey_template_stats') is not null),
  ('0060_live_campaign_visibility_and_audit.sql', 'table admin_audit_log', to_regclass('public.admin_audit_log') is not null),
  ('0061_security_column_guards.sql', 'function is_untrusted_writer', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='is_untrusted_writer')),
  ('0062_survey_presentation.sql', 'column survey_templates.question_font_size', exists (select 1 from information_schema.columns where table_schema='public' and table_name='survey_templates' and column_name='question_font_size')),
  ('0065_survey_other_option.sql', 'column survey_answers.other_text', exists (select 1 from information_schema.columns where table_schema='public' and table_name='survey_answers' and column_name='other_text')),
  ('0066_campaign_lifecycle.sql', 'table campaign_status_events', to_regclass('public.campaign_status_events') is not null),
  ('0069_email_verified.sql', 'column profiles.email_verified_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='email_verified_at')),
  ('0070_campaign_opening.sql', 'column campaigns.opens_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='opens_at')),
  ('0071_survey_skip_logic.sql', 'function survey_path_question_ids', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='survey_path_question_ids')),
  ('0072_analysis_reports.sql', 'table analysis_reports', to_regclass('public.analysis_reports') is not null),
  ('0073_survey_question_reach.sql', 'function survey_question_reach', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='survey_question_reach')),
  ('0074_email_verification_links.sql', 'table email_verification_tokens', to_regclass('public.email_verification_tokens') is not null),
  ('0075_auto_issue_reward_codes.sql', 'function render_notification_tokens', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='render_notification_tokens')),
  ('0077_message_read_receipts.sql', 'function mark_conversation_read', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='mark_conversation_read')),
  ('0078_artist_type_event_details.sql', 'column artists.artist_type', exists (select 1 from information_schema.columns where table_schema='public' and table_name='artists' and column_name='artist_type')),
  ('0079_reward_release_on_attendance.sql', 'function reward_release_on_attendance', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='reward_release_on_attendance')),
  ('0080_consent_records.sql', 'table consent_records', to_regclass('public.consent_records') is not null),
  ('0083_survey_capacity_review.sql', 'column survey_responses.over_capacity', exists (select 1 from information_schema.columns where table_schema='public' and table_name='survey_responses' and column_name='over_capacity')),
  ('0084_package_margin_private.sql', 'function admin_campaign_packages', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='admin_campaign_packages')),
  ('0085_campaign_margin_server_side.sql', 'function sponsored_events_net_budget', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='sponsored_events_net_budget')),
  ('0087_sales_report_file_name.sql', 'column ticket_sales_reports.report_file_name', exists (select 1 from information_schema.columns where table_schema='public' and table_name='ticket_sales_reports' and column_name='report_file_name')),
  ('0088_survey_codes_state.sql', 'function survey_codes_state', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='survey_codes_state')),
  ('0089_message_recall.sql', 'table message_recalls', to_regclass('public.message_recalls') is not null),
  ('0091_codes_setup_deadline.sql', 'column sponsored_events.codes_due_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='sponsored_events' and column_name='codes_due_at')),
  ('0092_form_drafts.sql', 'table form_drafts', to_regclass('public.form_drafts') is not null),
  ('0093_email_branding.sql', 'table email_branding', to_regclass('public.email_branding') is not null),
  ('0094_survey_sensitive_data.sql', 'column survey_answers.contains_pii', exists (select 1 from information_schema.columns where table_schema='public' and table_name='survey_answers' and column_name='contains_pii')),
  ('0095_public_event_page.sql', 'table sponsored_event_pages', to_regclass('public.sponsored_event_pages') is not null),
  ('0098_survey_access_reason_and_registration_copy.sql', 'function survey_access_reason', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='survey_access_reason')),
  ('0100_brandviews.sql', 'function sponsored_event_listing_facts', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='sponsored_event_listing_facts')),
  ('0101_support_admin_lookup.sql', 'function support_admin_id', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='support_admin_id')),
  ('0104_fulfilment_forms.sql', 'table sponsored_event_fulfilment', to_regclass('public.sponsored_event_fulfilment') is not null),
  ('0105_survey_quota_alert.sql', 'column survey_templates.quota_alert_sent_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='survey_templates' and column_name='quota_alert_sent_at')),
  ('0108_survey_requires_verified_email.sql', 'function survey_responses_require_verified_email', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='survey_responses_require_verified_email')),
  ('0110_artist_nudges.sql', 'table artist_nudges', to_regclass('public.artist_nudges') is not null),
  ('0111_survey_own_response_and_completions.sql', 'function my_survey_response', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='my_survey_response')),
  ('0112_notification_links_and_survey_review.sql', 'function survey_review_notify', exists (select 1 from pg_proc where pronamespace='public'::regnamespace and proname='survey_review_notify')),
  ('0113_email_button_settings.sql', 'column notification_settings.email_button', exists (select 1 from information_schema.columns where table_schema='public' and table_name='notification_settings' and column_name='email_button')),
  ('0114_event_cancellation_and_capacity.sql', 'table sponsored_event_cancellation_requests', to_regclass('public.sponsored_event_cancellation_requests') is not null),
  ('0115_brand_reports_files_and_change_requests.sql', 'table brand_files', to_regclass('public.brand_files') is not null),
  ('0116_marketing_campaigns.sql', 'table brand_subscriptions', to_regclass('public.brand_subscriptions') is not null)
)
select migration, marker, applied from m order by migration;
