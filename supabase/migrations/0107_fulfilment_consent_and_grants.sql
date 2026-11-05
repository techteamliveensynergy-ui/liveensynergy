-- =============================================================================
-- 0107 — follow-ups found when 0104 was verified on a real database.
--
-- 1. The consent log must accept 0104's consent types.
--    0104 replaces two CHECK constraints on consent_records (consent_type and
--    source) so the artist's fulfilment consent can be logged. Checked against
--    a real project, only part of that had taken effect. It matters because
--    consent_from_fulfilment() swallows its own errors by design (a log failure
--    must never fail the consent): if the constraint rejects the new type the
--    artist's consent is saved but NO consent record is written — no audit
--    trail, and no error anyone sees.
--
--    0104 dropped the old constraints by their default NAMES, which only works
--    if they still carry those names and nothing else restricts the columns.
--    This migration doesn't depend on names: it drops EVERY check constraint
--    on consent_records that mentions consent_type or source, then adds one of
--    each back. The allowed lists are the full set the app and migrations use,
--    UNION every value already stored in the table, so re-adding can never
--    fail on existing rows (a consent record is evidence; this must not touch
--    one).
--
-- 2. acknowledge_fulfilment_form() was executable by signed-out users.
--    0104 does `revoke all ... from public`, but Supabase also grants EXECUTE
--    on new functions to `anon` directly, which that revoke doesn't remove. It
--    was harmless (the function checks auth.uid() and answers 'forbidden') but
--    signed-out users shouldn't be able to call it at all. Same pattern as the
--    other definer functions (0061: `from public, anon`).
--
-- Re-runnable. No data is changed. Safe before or after the code.
-- =============================================================================
do $$
declare
  v_types   text[];
  v_sources text[];
  r         record;
begin
  -- The known lists (0080 + 0104) plus whatever is already stored.
  select coalesce(array_agg(x order by x), '{}') into v_types
    from (
      select unnest(array[
        'platform_terms', 'privacy_policy', 'email_verified', 'event_terms',
        'sponsor_marketing', 'survey_terms', 'residency_confirmed',
        'order_form_details', 'order_form_terms',
        'order_form_documents', 'fulfilment_commitments', 'fulfilment_terms'
      ]::text[])
      union
      select consent_type from public.consent_records
    ) s(x);

  select coalesce(array_agg(x order by x), '{}') into v_sources
    from (
      select unnest(array[
        'sign_up', 'survey_sign_up', 'verify_link', 'event_registration',
        'my_events', 'public_survey', 'dashboard_survey', 'order_form',
        'fulfilment_form'
      ]::text[])
      union
      select source from public.consent_records
    ) s(x);

  -- Whatever they are called, and however many there are.
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.consent_records'::regclass
       and contype = 'c'
       and (pg_get_constraintdef(oid) ~ '\mconsent_type\M'
            or pg_get_constraintdef(oid) ~ '\msource\M')
  loop
    execute format('alter table public.consent_records drop constraint %I', r.conname);
  end loop;

  execute format(
    'alter table public.consent_records add constraint consent_records_consent_type_check '
    'check (consent_type = any (%L::text[]))', v_types);
  execute format(
    'alter table public.consent_records add constraint consent_records_source_check '
    'check (source = any (%L::text[]))', v_sources);
end $$;

-- 2. Signed-out users can't call the fulfilment consent function.
do $$
begin
  if to_regprocedure('public.acknowledge_fulfilment_form(uuid)') is not null then
    revoke all on function public.acknowledge_fulfilment_form(uuid) from public, anon;
    grant execute on function public.acknowledge_fulfilment_form(uuid) to authenticated;
  end if;
end $$;
