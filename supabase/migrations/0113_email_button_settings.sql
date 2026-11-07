-- =============================================================================
-- 0113 — admins choose which notification emails carry an action button.
--
-- 0112 gave every notification email an action button that opens the related
-- page (email_outbox.link). The client asked for that to be an admin choice and
-- for the button to appear only where it's relevant — an email that asks
-- someone to DO something ("a response needs your review", "your invoice is
-- ready", "confirm your discount codes"), not a purely informational one
-- ("invoice paid", "consent received").
--
-- notification_settings gains:
--   email_button        — show the action button in this event's email.
--   email_button_label  — the button's text; null = chosen automatically from
--                         where the link goes ("Review this response", …).
-- Both are edited per event at /dashboard/admin/notifications/<key>.
--
-- New events default to no button (an admin switches it on). The UPDATE below
-- switches it on for the events that ask the recipient to act. Admins can change
-- any of them. Independently of the button, an email template can include
-- {{link}} anywhere in its text — the sender replaces it with the address of the
-- related page.
--
-- In-app notifications are unaffected: every row in the app opens its page.
--
-- Additive and re-runnable. The UPDATE only touches rows still on the default
-- and runs once (it keys on the column having just been added).
-- =============================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notification_settings' and column_name = 'email_button'
  ) then
    alter table public.notification_settings
      add column email_button boolean not null default false,
      add column email_button_label text;

    update public.notification_settings
       set email_button = true
     where event_key in (
       -- the admin team: something is waiting for them
       'admin.survey_needs_review', 'admin.survey_quota_reached', 'admin.codes_overdue',
       'admin.campaign_intake_received', 'admin.campaign_request', 'admin.campaign_interest',
       'admin.contact_message', 'admin.feedback_received', 'admin.invoice_payment_failed',
       'admin.order_form_changes_requested', 'admin.sponsored_change_requested',
       'admin.sponsored_proof_submitted', 'admin.ticket_sales_report_submitted',
       -- brands
       'brand.billing_details_needed', 'order_form.sent', 'invoice.sent', 'invoice.reminder',
       'invoice.payment_failed', 'campaign.opened', 'campaign.matched', 'sponsorship.artist_agreed',
       -- artists / organisers
       'fulfilment.form_ready', 'fulfilment.form_updated', 'sponsorship.codes_due_soon',
       'sponsorship.artist_nudge', 'reward.codes_ready_for_review', 'sponsored.proof_reviewed',
       'offer.proposal_received', 'participant.proof_uploaded', 'sponsorship.confirmed',
       -- audience
       'reward.code_issued', 'campaign.registrations_open', 'participation.selected',
       -- everyone
       'message.received', 'account.welcome'
     );
  end if;
end $$;
