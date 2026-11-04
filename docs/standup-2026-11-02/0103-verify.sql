-- =============================================================================
-- 0103 (artist fulfilment) — pre-flight and post-apply checks.
--
-- READ-ONLY: nothing here writes. Safe to run on dev or production in the
-- Supabase SQL editor. Run PART A first, then apply
-- supabase/migrations/0103_artist_fulfilment.sql, then run PART B.
-- Each check says what it should return.
-- =============================================================================


-- ============================ PART A — before applying =======================

-- A1. The two CHECK constraints 0103 replaces must have these exact names.
--     Expect 2 rows: consent_records_consent_type_check, consent_records_source_check.
--     If a name differs, STOP: the migration's `drop constraint if exists` would
--     skip it and the old, narrower check would stay — new consent records
--     would then fail silently (the trigger swallows the error).
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.consent_records'::regclass and contype = 'c'
 order by conname;

-- A2. The two policies 0103 replaces. Expect 2 rows.
select polrelid::regclass as "table", polname
  from pg_policy
 where polname in ('sponsored_events: public read confirmed', 'event_listings: public read available');

-- A3. What the backfill will mark live (these keep their public visibility).
--     Nothing to compare against yet; note the numbers for B2/B3.
select count(*) filter (where status in ('confirmed', 'completed')) as will_be_backfilled_live,
       count(*) filter (where status = 'in_progress')                as in_progress_no_row,
       count(*) filter (where status = 'withdrawn')                  as withdrawn_no_row
  from public.sponsored_events;

-- A4. Not applied yet. Expect both NULL.
select to_regclass('public.sponsored_event_fulfilment') as fulfilment_table,
       to_regclass('public.artist_invoices')            as invoices_table;


-- ============================ PART B — after applying ========================

-- B1. Tables exist. Expect both non-null.
select to_regclass('public.sponsored_event_fulfilment') as fulfilment_table,
       to_regclass('public.artist_invoices')            as invoices_table;

-- B2. Backfill: every confirmed/completed event has a COMPLETED fulfilment row.
--     Expect 0. (Run straight after applying; once a NEW sponsorship is
--     confirmed it legitimately waits, so a non-zero count later is those.)
select count(*) as confirmed_but_not_fulfilled
  from public.sponsored_events se
  left join public.sponsored_event_fulfilment f on f.sponsored_event_id = se.id
 where se.status in ('confirmed', 'completed') and f.completed_at is null;

-- B3. Nothing live went offline: the old "confirmed" count equals A3's
--     will_be_backfilled_live, and all of them read as fulfilled. Expect equal.
select count(*) filter (where se.status in ('confirmed', 'completed'))                                    as confirmed_or_completed,
       count(*) filter (where se.status in ('confirmed', 'completed') and public.sponsored_event_fulfilled(se.id)) as of_which_fulfilled
  from public.sponsored_events se;

-- B4. Policies swapped. Expect exactly these 2 rows (and no "public read available").
select polrelid::regclass as "table", polname, polroles::regrole[] as roles
  from pg_policy
 where polname in ('sponsored_events: public read confirmed',
                   'event_listings: signed-in read available',
                   'event_listings: public read available')
 order by 1, 2;

-- B5. Privileges. Expect: false, false, false, false.
select has_table_privilege('authenticated', 'public.artist_invoices', 'DELETE')                as invoices_delete_by_signed_in,
       has_table_privilege('authenticated', 'public.sponsored_event_fulfilment', 'DELETE')     as fulfilment_delete_by_signed_in,
       has_table_privilege('anon', 'public.artist_invoices', 'SELECT')                         as invoices_read_by_anon,
       has_table_privilege('anon', 'public.sponsored_event_fulfilment', 'SELECT')              as fulfilment_read_by_anon;

-- B6. The consent log accepts the new types. Expect 2 rows (both constraints
--     mention the new values).
select conname
  from pg_constraint
 where conrelid = 'public.consent_records'::regclass and contype = 'c'
   and (pg_get_constraintdef(oid) like '%artist_fulfilment_terms%' or pg_get_constraintdef(oid) like '%''fulfilment''%')
 order by conname;

-- B7. Notifications: 5 events, 5 settings rows, 10 templates (in_app + email each).
select (select count(*) from public.notification_events    where key in ('fulfilment.requested','fulfilment.terms_updated','fulfilment.live','admin.fulfilment_submitted','admin.artist_invoice_uploaded')) as events,
       (select count(*) from public.notification_settings  where event_key in ('fulfilment.requested','fulfilment.terms_updated','fulfilment.live','admin.fulfilment_submitted','admin.artist_invoice_uploaded')) as settings,
       (select count(*) from public.notification_templates where event_key in ('fulfilment.requested','fulfilment.terms_updated','fulfilment.live','admin.fulfilment_submitted','admin.artist_invoice_uploaded')) as templates;

-- B8. Functions exist; the ones that must be SECURITY DEFINER are.
--     Expect 10 rows, definer = true for all except fulfilment_has_promo and
--     fulfilment_reset_consent (plain functions by design).
select p.proname, p.prosecdef as definer
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('sponsored_event_fulfilled','sponsored_events_waiting_fulfilment','confirm_promotion_terms',
                     'submit_artist_fulfilment','admin_set_fulfilment','sponsored_events_fulfilment_row',
                     'consent_from_fulfilment','participations_require_open',
                     'fulfilment_has_promo','fulfilment_reset_consent')
 order by 1;

-- B9. Who may call the RPCs. Expect: anon cannot call any of the three; signed-in can.
select has_function_privilege('anon', 'public.admin_set_fulfilment(uuid,text,text)', 'EXECUTE')             as anon_admin_set,
       has_function_privilege('anon', 'public.submit_artist_fulfilment(uuid,text,boolean)', 'EXECUTE')     as anon_submit,
       has_function_privilege('anon', 'public.confirm_promotion_terms(uuid,text[])', 'EXECUTE')            as anon_confirm_promo,
       has_function_privilege('authenticated', 'public.submit_artist_fulfilment(uuid,text,boolean)', 'EXECUTE') as signed_in_submit;
-- expected: false, false, false, true

-- B10. Triggers in place. Expect 5 rows.
select tgrelid::regclass as "table", tgname
  from pg_trigger
 where not tgisinternal
   and tgname in ('sponsored_events_fulfilment_row','fulfilment_reset_consent',
                  'sponsored_event_fulfilment_consent_records','sponsored_event_fulfilment_set_updated_at',
                  'participations_require_open')
 order by 1, 2;

-- B11. The public gate agrees with the table. Expect 0 rows: no event the
--      public page treats as public that isn't fulfilled.
select se.id, se.reference
  from public.sponsored_events se
 where public.sponsored_event_is_public(se.id) and not public.sponsored_event_fulfilled(se.id);


-- ====================== PART C — try it on dev (by hand) =====================
-- With the QA accounts in docs/qa-creds.md (admin / brand / artist / audience):
--  1. Confirm a NEW sponsorship (both parties agree). Artist gets "Complete the
--     fulfilment form"; the event shows "Waiting for fulfilment" on the
--     partnered-events lists (artist, brand and admin).
--  2. Signed out, open /events and /events/<id>: the new event is NOT there.
--     Signed in as the audience QA account: it is not on Discover either.
--  3. Admin → that event → "Artist fulfilment form": tick channels, add a
--     second name, posts, handles, special terms, proof requirements, payment
--     terms → Save.
--  4. Artist → the event page: confirm the discount codes (three ticks, needs
--     codes set up by admin first), confirm the four promotional confirmations,
--     upload a PDF invoice, tick the final consent → Submit.
--  5. The chip turns "Live"; /events and /events/<id> now show it; audience can
--     register. Admin got "Fulfilment completed".
--  6. Admin edits the post count → artist sees "terms updated, confirm again";
--     the event STAYS live. Admin → "Reopen the form" → it leaves /events.
--  7. As the brand: the page shows only the badge — no fulfilment card, no
--     invoices.
