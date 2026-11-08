-- =============================================================================
-- 0115 — Change-request decisions that always land, AI reports published to
-- brands, and a "My files" area for brands. (QA 9 Nov.)
--
--   1. admin_resolve_change_request(): the admin's Approve / Decline on a
--      party's change request. It used to be a direct UPDATE from the app whose
--      result was never checked, so when it didn't land the request just stayed
--      "Pending" with nothing on screen and the requester was never told
--      (QA: "Decline does nothing"). Now one admin-checked call: only from
--      pending, says why when it can't, notifies the requester with the
--      decision and the admin's reply, and is audited. The notification text
--      finally says approved/declined (it said "Your requested change was
--      reviewed") — replaced only where an admin hasn't edited it.
--   2. AI survey reports (0072) can be published to the campaign's brand by an
--      admin ("Share with brand"), only with at least 5 responses (the brand
--      never sees results below 5 — 0060). Brands read a published report only
--      through brand_analysis_report(s)() — title, narrative and figures; never
--      the admin's prompt, the file name or errors.
--   4. validate_survey_answer_types() (0071) treats a blank text answer or an
--      empty selection as unanswered, like the app does — a required question
--      could otherwise be "answered" with spaces by calling the API directly.
--   3. brand_files: a brand's own files (logos, guidelines, decks) in the
--      Repository. Private storage under {brand}/brand-files/. The team can
--      always open them; a file marked "partners" can also be opened by an
--      artist in a live or finished partnership with that brand.
-- Additive and re-runnable.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Change-request decisions
-- ---------------------------------------------------------------------------
create or replace function public.admin_resolve_change_request(
  p_request_id uuid,
  p_op         text,
  p_response   text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req    record;
  v_status sponsored_event_change_request_status;
  v_ev     record;
  v_reply  text := nullif(btrim(coalesce(p_response, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admins can decide change requests.' using errcode = '42501';
  end if;
  if p_op not in ('approve', 'decline') then
    raise exception 'Choose Approve or Decline.' using errcode = 'P0001';
  end if;
  v_status := case when p_op = 'approve' then 'approved' else 'declined' end;

  update public.sponsored_event_change_requests
     set status = v_status, admin_response = v_reply, resolved_by = auth.uid(), resolved_at = now()
   where id = p_request_id and status = 'pending'
  returning * into v_req;
  if not found then
    if exists (select 1 from public.sponsored_event_change_requests where id = p_request_id) then
      raise exception 'That request has already been decided — refresh the page.' using errcode = 'P0001';
    end if;
    raise exception 'That request no longer exists.' using errcode = 'P0001';
  end if;

  select name, reference into v_ev from public.sponsored_events where id = v_req.sponsored_event_id;
  perform public.notify_from_db(
    'sponsored.change_resolved', v_req.requested_by,
    jsonb_build_object(
      'event_name', coalesce(v_ev.name, 'your partnership'),
      'reference', coalesce(v_ev.reference, ''),
      'status', v_status::text,
      'response', coalesce(v_reply, case when v_status = 'approved'
        then 'The team will make the change and confirm it with you.'
        else 'Get in touch with the team if you''d like to discuss it.' end)),
    '/dashboard/sponsored/' || v_req.sponsored_event_id || '#change-requests');

  perform public.log_admin_action('sponsored_event.change_request_' || v_status::text, 'sponsored_event',
    v_req.sponsored_event_id::text,
    jsonb_build_object('request_id', p_request_id, 'response', v_reply));
  return v_status::text;
end;
$$;
revoke all on function public.admin_resolve_change_request(uuid, text, text) from public, anon;
grant execute on function public.admin_resolve_change_request(uuid, text, text) to authenticated;

-- Say what was decided (the 0029 defaults only said "reviewed"). Only rows
-- still holding those defaults are changed, so an admin's own wording stays.
update public.notification_events
   set variables = '{event_name,reference,status,response}'
 where key = 'sponsored.change_resolved'
   and not ('response' = any (coalesce(variables, '{}')));

update public.notification_templates
   set subject = 'Change request {{status}}: {{event_name}}',
       body    = 'Your change request for {{event_name}} ({{reference}}) was {{status}}. {{response}}'
 where event_key = 'sponsored.change_resolved' and channel = 'in_app'
   and body = 'Your requested change was reviewed.';

update public.notification_templates
   set subject = 'Your change request was {{status}} · Live·En·Synergy',
       body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
                 'The team has looked at your change request for {{event_name}} ({{reference}}): it was {{status}}.' || chr(10) || chr(10) ||
                 '{{response}}' || chr(10) || chr(10) ||
                 '— The Live·En·Synergy team'
 where event_key = 'sponsored.change_resolved' and channel = 'email'
   and body like '%Your requested change was reviewed.%';

-- ---------------------------------------------------------------------------
-- 2. AI reports published to the brand
-- ---------------------------------------------------------------------------
alter table public.analysis_reports
  add column if not exists shared_with_brand_at timestamptz,
  add column if not exists shared_by            uuid references public.profiles (id) on delete set null;

-- Publish / unpublish (admin). Refuses a report with no campaign or under 5
-- responses, and tells the brand once when it is first published.
create or replace function public.admin_share_analysis_report(p_report_id uuid, p_share boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep   record;
  v_brand uuid;
  v_when  timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Only admins can publish reports.' using errcode = '42501';
  end if;
  select r.id, r.title, r.campaign_id, r.row_count, r.shared_with_brand_at, r.narrative
    into v_rep
    from public.analysis_reports r where r.id = p_report_id for update;
  if not found then
    raise exception 'No such report.' using errcode = 'P0001';
  end if;

  if not p_share then
    update public.analysis_reports set shared_with_brand_at = null, shared_by = null where id = p_report_id;
    perform public.log_admin_action('analysis_report.unshared', 'analysis_report', p_report_id::text, '{}'::jsonb);
    return null;
  end if;

  if v_rep.campaign_id is null then
    raise exception 'Link the report to the brand''s campaign first — it has no campaign.' using errcode = 'P0001';
  end if;
  if coalesce(v_rep.row_count, 0) < 5 then
    raise exception 'Brands only see results from 5 responses up — this report has %.', coalesce(v_rep.row_count, 0)
      using errcode = 'P0001';
  end if;
  if v_rep.shared_with_brand_at is not null then
    return v_rep.shared_with_brand_at;
  end if;

  v_when := now();
  update public.analysis_reports set shared_with_brand_at = v_when, shared_by = auth.uid() where id = p_report_id;

  select b.profile_id into v_brand
    from public.campaigns c join public.brands b on b.id = c.brand_id
   where c.id = v_rep.campaign_id;
  if v_brand is not null then
    perform public.notify_from_db(
      'brand.report_published', v_brand,
      jsonb_build_object('report_title', v_rep.title),
      '/dashboard/campaigns/live/' || v_rep.campaign_id || '/reports/' || p_report_id);
  end if;
  perform public.log_admin_action('analysis_report.shared', 'analysis_report', p_report_id::text,
    jsonb_build_object('campaign_id', v_rep.campaign_id, 'responses', v_rep.row_count));
  return v_when;
end;
$$;
revoke all on function public.admin_share_analysis_report(uuid, boolean) from public, anon;
grant execute on function public.admin_share_analysis_report(uuid, boolean) to authenticated;

-- Is this campaign the caller's brand's (or is the caller an admin)?
create or replace function public.is_my_brand_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.campaigns c join public.brands b on b.id = c.brand_id
     where c.id = p_campaign_id and b.profile_id = auth.uid())
$$;
revoke all on function public.is_my_brand_campaign(uuid) from public, anon;
grant execute on function public.is_my_brand_campaign(uuid) to authenticated;

-- The brand's published reports for one campaign (or all of theirs).
create or replace function public.brand_analysis_reports(p_campaign_id uuid default null)
returns table (id uuid, campaign_id uuid, title text, row_count integer, shared_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.campaign_id, r.title, r.row_count, r.shared_with_brand_at
    from public.analysis_reports r
   where r.shared_with_brand_at is not null
     and r.row_count >= 5
     and r.campaign_id is not null
     and (p_campaign_id is null or r.campaign_id = p_campaign_id)
     and public.is_my_brand_campaign(r.campaign_id)
   order by r.shared_with_brand_at desc
$$;
revoke all on function public.brand_analysis_reports(uuid) from public, anon;
grant execute on function public.brand_analysis_reports(uuid) to authenticated;

-- One published report — only what the brand should see.
create or replace function public.brand_analysis_report(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'campaign_id', r.campaign_id, 'title', r.title, 'row_count', r.row_count,
    'figures', r.figures, 'narrative', r.narrative, 'model', r.model,
    'shared_at', r.shared_with_brand_at,
    'campaign_reference', c.reference, 'campaign_name', c.campaign_name, 'brand_name', b.brand_name)
    from public.analysis_reports r
    join public.campaigns c on c.id = r.campaign_id
    left join public.brands b on b.id = c.brand_id
   where r.id = p_report_id
     and r.shared_with_brand_at is not null
     and r.row_count >= 5
     and public.is_my_brand_campaign(r.campaign_id)
$$;
revoke all on function public.brand_analysis_report(uuid) from public, anon;
grant execute on function public.brand_analysis_report(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Brand files
-- ---------------------------------------------------------------------------
create table if not exists public.brand_files (
  id               uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(btrim(title)) between 1 and 200),
  description      text check (description is null or char_length(description) <= 1000),
  file_path        text not null,
  file_name        text not null check (char_length(file_name) <= 255),
  content_type     text,
  size_bytes       bigint,
  -- 'team' = only the brand and the Live·En·Synergy team; 'partners' = also
  -- artists in a partnership with this brand.
  visibility       text not null default 'partners' check (visibility in ('team', 'partners')),
  created_at       timestamptz not null default now(),
  -- The path must sit in the owner's own brand-files folder (storage policy
  -- 0009 already limits writes to one's own first folder).
  check (file_path like brand_profile_id::text || '/brand-files/%')
);
create index if not exists brand_files_owner_idx on public.brand_files (brand_profile_id, created_at desc);

-- Can the caller open this brand's partner-visible files? The brand itself,
-- an admin, or an artist in a proposed, confirmed or finished partnership
-- with the brand. Text in, so a storage policy can pass a folder name safely.
create or replace function public.can_read_brand_files(p_brand_profile text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
    auth.uid()::text = p_brand_profile
    or public.is_admin()
    or exists (
      select 1 from public.sponsored_events se
        join public.brands b on b.id = se.brand_id
       where b.profile_id::text = p_brand_profile
         and se.artist_profile_id = auth.uid()
         and se.status in ('in_progress', 'confirmed', 'completed')))
$$;
revoke all on function public.can_read_brand_files(text) from public, anon;
grant execute on function public.can_read_brand_files(text) to authenticated;

alter table public.brand_files enable row level security;
drop policy if exists "brand_files: owner" on public.brand_files;
create policy "brand_files: owner" on public.brand_files
  for all using (brand_profile_id = auth.uid()) with check (brand_profile_id = auth.uid());
drop policy if exists "brand_files: admin" on public.brand_files;
create policy "brand_files: admin" on public.brand_files
  for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "brand_files: partners read" on public.brand_files;
create policy "brand_files: partners read" on public.brand_files
  for select using (visibility = 'partners' and public.can_read_brand_files(brand_profile_id::text));
grant select, insert, update, delete on public.brand_files to authenticated;
grant all on public.brand_files to service_role;

-- Storage: partners may sign a brand's partner-visible files. The table row
-- decides visibility, so a 'team' file stays closed even if its path is known.
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "private-uploads: brand files for partners" on storage.objects;
    create policy "private-uploads: brand files for partners" on storage.objects
      for select using (
        bucket_id = 'private-uploads'
        and (storage.foldername(name))[2] = 'brand-files'
        and exists (
          select 1 from public.brand_files f
           where f.file_path = storage.objects.name
             and f.visibility = 'partners'
             and public.can_read_brand_files(f.brand_profile_id::text)));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Notification: a report was published to the brand
-- ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('brand.report_published', 'Survey report published',
   'The team published an AI survey report on your campaign.',
   'brand', 'The brand', '{user_name,report_title}', 245)
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'notification_settings'
                and column_name = 'email_button') then
    insert into public.notification_settings (event_key, email_button)
    values ('brand.report_published', true)
    on conflict (event_key) do nothing;
  end if;
end $$;
insert into public.notification_settings (event_key) values ('brand.report_published')
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select v.event_key, v.channel, v.subject, v.body
  from (values
    ('brand.report_published', 'in_app', 'Your survey report is ready: {{report_title}}',
     'The team has published "{{report_title}}" on your campaign — open it to read the findings and download it.'),
    ('brand.report_published', 'email', 'Your survey report is ready · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'Your survey report "{{report_title}}" is ready. It summarises what the audience told us, with charts and recommendations, and you can download it as a Word document.' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team')
  ) as v(event_key, channel, subject, body)
 where not exists (
   select 1 from public.notification_templates t where t.event_key = v.event_key and t.channel = v.channel);

-- ---------------------------------------------------------------------------
-- 5. Required questions: blank text / empty selections are not answers
--    (0071's validator, unchanged apart from the emptiness test)
-- ---------------------------------------------------------------------------
create or replace function public.validate_survey_answer_types(p_template_id uuid, p_answers jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q          record;
  v_entry      jsonb;
  v_val        jsonb;
  v_raw        jsonb;
  v_min_select int;
  v_max_select int;
  v_min        numeric;
  v_max        numeric;
  v_max_length int;
  v_path       uuid[];
begin
  -- Skip logic (0071): the questions this respondent's answers lead through.
  v_path := survey_path_question_ids(p_template_id, p_answers);

  for v_raw in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb))
  loop
    if not exists (
      select 1 from survey_questions q
      where q.id = (v_raw->>'question_id')::uuid and q.template_id = p_template_id
    ) then
      return 'Unrecognised question in submission.';
    end if;
    -- An answer to a question the path skipped is refused, so a raw SDK call
    -- can't fill in a branch the respondent never saw.
    if not ((v_raw->>'question_id')::uuid = any(v_path))
       and coalesce(v_raw->'value', 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb) then
      return 'An answer was sent for a question your earlier answers skipped. Please go back and check.';
    end if;
  end loop;

  for v_q in select * from survey_questions where template_id = p_template_id order by order_index
  loop
    if v_q.type = 'hidden_field' or not (v_q.id = any(v_path)) then
      continue;
    end if;

    select e into v_entry
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) e
    where (e->>'question_id')::uuid = v_q.id
    limit 1;

    v_val := v_entry -> 'value';

    -- Blank text and an empty selection count as no answer (0115) — the same
    -- rule as isAnswerEmpty() in src/lib/surveys.ts, which trims. Before, "   "
    -- or [] sent straight to the API satisfied a required question.
    if v_val is null or v_val = 'null'::jsonb
       or (jsonb_typeof(v_val) = 'string' and btrim(v_val #>> '{}') = '')
       or (jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      if v_q.required then
        return format('Question %s needs an answer.', v_q.order_index + 1);
      end if;
      continue;
    end if;

    case v_q.type
      when 'single_choice', 'dropdown', 'attention_check', 'yes_no' then
        -- "Other — please specify" (0065): the reserved value is valid only
        -- on a single_choice/dropdown question that offers it.
        if v_q.type in ('single_choice', 'dropdown')
           and coalesce((v_q.config->>'allow_other')::boolean, false)
           and (v_val #>> '{}') = '__other__' then
          null;
        elsif jsonb_typeof(v_val) <> 'string' or not exists (
          select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o
          where o->>'value' = v_val #>> '{}'
        ) then
          return format('Question %s has an invalid answer.', v_q.order_index + 1);
        end if;

      when 'multiple_choice' then
        if jsonb_typeof(v_val) <> 'array' or exists (
          select 1 from jsonb_array_elements_text(v_val) x
          where not exists (
            select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o where o->>'value' = x
          )
          and not (x = '__other__' and coalesce((v_q.config->>'allow_other')::boolean, false))
        ) then
          return format('Question %s has an invalid answer.', v_q.order_index + 1);
        end if;
        v_min_select := nullif(v_q.config->>'min_select', '')::int;
        v_max_select := nullif(v_q.config->>'max_select', '')::int;
        if v_min_select is not null and jsonb_array_length(v_val) < v_min_select then
          return format('Question %s needs at least %s selections.', v_q.order_index + 1, v_min_select);
        end if;
        if v_max_select is not null and jsonb_array_length(v_val) > v_max_select then
          return format('Question %s allows at most %s selections.', v_q.order_index + 1, v_max_select);
        end if;

      when 'ranking' then
        if jsonb_typeof(v_val) <> 'array'
           or jsonb_array_length(v_val) <> jsonb_array_length(coalesce(v_q.options, '[]'::jsonb))
           or (select count(distinct x) from jsonb_array_elements_text(v_val) x) <> jsonb_array_length(v_val)
           or exists (
             select 1 from jsonb_array_elements_text(v_val) x
             where not exists (select 1 from jsonb_array_elements(coalesce(v_q.options, '[]'::jsonb)) o where o->>'value' = x)
           )
        then
          return format('Question %s must rank every option exactly once.', v_q.order_index + 1);
        end if;

      when 'number' then
        if jsonb_typeof(v_val) <> 'number' then
          return format('Question %s must be a number.', v_q.order_index + 1);
        end if;
        v_min := nullif(v_q.config->>'min', '')::numeric;
        v_max := nullif(v_q.config->>'max', '')::numeric;
        if (v_min is not null and (v_val #>> '{}')::numeric < v_min)
           or (v_max is not null and (v_val #>> '{}')::numeric > v_max) then
          return format('Question %s is out of range.', v_q.order_index + 1);
        end if;

      when 'scale' then
        -- '__na__' (SCALE_NA_VALUE) is only a valid answer when the question
        -- actually offers the opt-out tile (na_label set) — otherwise it
        -- falls through to the same numeric check as any other scale value.
        if coalesce(v_q.config->>'na_label', '') <> '' and (v_val #>> '{}') = '__na__' then
          null;
        elsif jsonb_typeof(v_val) <> 'number' then
          return format('Question %s must be a number.', v_q.order_index + 1);
        else
          v_min := nullif(v_q.config->>'min', '')::numeric;
          v_max := nullif(v_q.config->>'max', '')::numeric;
          if (v_min is not null and (v_val #>> '{}')::numeric < v_min)
             or (v_max is not null and (v_val #>> '{}')::numeric > v_max) then
            return format('Question %s is out of range.', v_q.order_index + 1);
          end if;
        end if;

      when 'short_text', 'long_text' then
        if jsonb_typeof(v_val) <> 'string' then
          return format('Question %s must be text.', v_q.order_index + 1);
        end if;
        v_max_length := coalesce(nullif(v_q.config->>'max_length', '')::int, 5000);
        if length(v_val #>> '{}') > v_max_length then
          return format('Question %s is too long.', v_q.order_index + 1);
        end if;

      else
        null; -- hidden_field already skipped above
    end case;

    -- "Other" chosen → the typed text is required, and bounded (0065).
    if survey_answer_chose_other(v_val) then
      if coalesce(btrim(v_entry->>'other_text'), '') = '' then
        return format('Question %s: please say what "Other" is.', v_q.order_index + 1);
      end if;
      if length(btrim(v_entry->>'other_text')) > 200 then
        return format('Question %s: the "Other" answer is too long (200 characters at most).', v_q.order_index + 1);
      end if;
    end if;
  end loop;

  return null;
end;
$function$;
