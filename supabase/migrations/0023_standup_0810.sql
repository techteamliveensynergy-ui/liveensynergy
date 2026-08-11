-- =============================================================================
-- Live-En-Synergy — 10 Aug standup batch
--
-- Covers, in order:
--   1. phone uniqueness  — narrowed to audience accounts, so one person can
--                          hold several roles
--   2. profiles RLS      — you can read the name of whoever you're chatting to
--   3. messages RLS      — an admin can post into a thread as themselves
--   4. campaigns         — the sponsor's "suggest an event / link" box
--   5. contact_messages  — carry a reference and the signed-in submitter
--   6. notifications     — templates quote the reference they're about
--   7. agree_to_sponsorship() — returns the withdrawn siblings' references
--
-- Additive except step 1, which drops three unique indexes that are now
-- deliberately wrong, and step 6, which rewrites the seeded template text
-- (admin edits to a template are preserved — see the step for how). Step 7
-- redefines a function from 0022 verbatim apart from one extra column.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Phone uniqueness — audience accounts only
--
-- 0021 made a phone number unique across all four role tables. The intent was
-- to stop one person opening several audience accounts to enter a draw more
-- than once. The effect was broader than that: the same person couldn't
-- register as an artist *and* as an audience member, which is a perfectly
-- ordinary thing to want (10 Aug standup) — plenty of artists also attend
-- events, and an agency runs two brand accounts from one desk phone.
--
-- So the rule narrows to what it was actually for: no two audience members may
-- share a number. Every other combination is allowed, including an audience
-- member and an artist on the same number, because they're the same person.
-- ---------------------------------------------------------------------------
create or replace function phone_in_use(p_phone text, p_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when phone_digits(p_phone) = '' then false
    else exists (
      select 1 from public.audience_members a
       where a.profile_id is distinct from p_profile_id
         and a.phone is not null
         and phone_digits(coalesce(a.phone_country_code, '') || a.phone)
             = phone_digits(p_phone)
    )
  end;
$$;

grant execute on function phone_in_use(text, uuid) to authenticated, anon;

-- The audience index stays; the other three enforced the rule we've just
-- decided against, so they have to go or the database would keep rejecting
-- what the application now allows.
drop index if exists artists_contact_phone_key;
drop index if exists event_organisers_contact_phone_key;
drop index if exists brands_manager_phone_key;

-- …except `audience_members_phone_key` is, on this database, the one that
-- never got created: 0021 wrapped each index so that existing duplicates
-- produced a notice rather than failing the whole migration, and the audience
-- table had two duplicate pairs. Which leaves the *only* rule we still want
-- with no backstop but the application check.
--
-- Try again here, on the same terms. If duplicates remain it says which and
-- carries on; clean them up and re-run this block — it's idempotent.
do $$
declare
  dupes text;
begin
  if to_regclass('public.audience_members_phone_key') is not null then
    return;
  end if;

  begin
    create unique index audience_members_phone_key on audience_members
      (phone_digits(coalesce(phone_country_code, '') || phone))
      where phone is not null and btrim(phone) <> '';
    raise notice 'Created audience_members_phone_key.';
  exception when unique_violation then
    select string_agg(k, ', ') into dupes from (
      select phone_digits(coalesce(phone_country_code, '') || phone) as k
        from audience_members
       where phone is not null and btrim(phone) <> ''
       group by 1 having count(*) > 1
    ) d;
    raise notice
      'Skipped audience_members_phone_key — these numbers are on more than one audience account: %. Resolve them and re-run this block.',
      dupes;
  end;
end
$$;


-- ---------------------------------------------------------------------------
-- 2. profiles — read the name of whoever you're in a conversation with
--
-- Chat rendered every message identically because the only thing the page
-- could tell was "did I send this?" — no use at all to an admin reading a
-- thread between two other people (10 Aug standup). Showing a name means being
-- able to read the counterparty's profile row, which `profiles: read own or
-- admin` doesn't allow.
--
-- security definer, like `is_my_event_participant`, so the lookup can see the
-- conversations table without the caller needing to; and because a policy on
-- profiles that itself selects from profiles would recurse.
-- ---------------------------------------------------------------------------
create or replace function is_my_conversation_peer(p_profile uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.conversations c
     where (c.brand_profile_id = auth.uid()   and c.partner_profile_id = p_profile)
        or (c.partner_profile_id = auth.uid() and c.brand_profile_id  = p_profile)
  );
$$;

grant execute on function is_my_conversation_peer(uuid) to authenticated;

drop policy if exists "profiles: read my conversation peer" on profiles;
create policy "profiles: read my conversation peer"
  on profiles for select
  using (is_my_conversation_peer(id));


-- ---------------------------------------------------------------------------
-- 3. messages — let an admin post into a thread
--
-- `messages: send as participant` requires the sender to be one of the two
-- profiles on the conversation, so an admin could read every thread and write
-- in none of them. The team needs to relay a sponsor's suggested event into
-- the brand↔artist chat (step 4) and, more generally, to chase a stalled
-- conversation.
--
-- `sender_profile_id = auth.uid()` is kept deliberately: an admin posts *as
-- themselves*, visibly. Nothing here lets anyone write a message under another
-- person's name.
-- ---------------------------------------------------------------------------
drop policy if exists "messages: admin send" on messages;
create policy "messages: admin send"
  on messages for insert
  with check (is_admin() and sender_profile_id = auth.uid());


-- ---------------------------------------------------------------------------
-- 4. campaigns — the sponsor's suggested event
--
-- A brand often already has an event in mind, or a link to one, and until now
-- had nowhere to say so: the brief captured category, location and timeline
-- but not "we'd like to sponsor this specific thing" (10 Aug standup). The
-- team sees it on the campaign, and it's relayed into the chat when the
-- campaign is matched.
-- ---------------------------------------------------------------------------
alter table campaigns
  add column if not exists suggested_event_note text,
  add column if not exists suggested_event_url  text;

comment on column campaigns.suggested_event_note is
  'Free text from the sponsor describing an external event they''d like to sponsor.';
comment on column campaigns.suggested_event_url is
  'Optional link to that event. Normalised to a full https:// URL on save.';

-- Carried onto the artist-facing browse view. No contact details are added —
-- the view still deliberately omits the campaign manager's name, email and
-- phone, which is the whole reason it exists.
--
-- The two new columns go at the **end** of the select list, not next to the
-- other campaign columns where they belong. `create or replace view` can only
-- append: inserting them mid-list is read as renaming `brand_name` to
-- `suggested_event_note` and Postgres refuses (42P16). Dropping and recreating
-- the view instead would mean dropping its grant and any dependent object, for
-- the sake of column order nobody sees.
create or replace view open_campaigns as
  select
    c.id,
    c.reference,
    c.description,
    c.expected_outcomes,
    c.budget_gbp,
    c.category,
    c.category_other,
    c.preferred_location,
    c.preferred_timeline,
    c.reward_rules,
    c.image_url,
    c.created_at,
    b.brand_name,
    b.logo_url    as brand_logo_url,
    b.product_category as brand_category,
    b.id          as brand_id,
    b.profile_id  as brand_profile_id,
    c.suggested_event_note,
    c.suggested_event_url
  from campaigns c
  join brands b on b.id = c.brand_id
  where c.status = 'in_progress'
    and c.matched_listing_id is null;

grant select on open_campaigns to authenticated;


-- ---------------------------------------------------------------------------
-- 5. contact_messages — what the enquiry is about, and who sent it
--
-- Enquiries landed in the admin inbox as a name, an email and a wall of text.
-- Working out which sponsorship one referred to meant asking (10 Aug standup).
-- `reference` carries the SPE-/CMP-/EVT- number the form was opened from, and
-- `profile_id` links a signed-in submitter to their account so the team can
-- reply in-app rather than by email.
-- ---------------------------------------------------------------------------
alter table contact_messages
  add column if not exists reference  text,
  add column if not exists profile_id uuid references profiles (id) on delete set null;

create index if not exists contact_messages_profile_id_idx
  on contact_messages (profile_id);

-- The form is public, so the insert policy stays open. Reading is still
-- admin-only, and `profile_id` is set from the session rather than the form.


-- ---------------------------------------------------------------------------
-- 6. Notification templates — say which thing you're about
--
-- Every template was seeded from its event's one-line description, so what
-- landed in the bell was "New feedback report — A user submitted a bug or text
-- change", with no reference, no title and nothing to search for (10 Aug
-- standup, screenshot). The variables were already being passed by the call
-- sites; the templates simply never used them.
--
-- Only templates still holding the seeded text are rewritten — an admin who
-- has edited a template in Notification setup keeps their wording. That's the
-- point of the `where` clauses below: the seed was `subject = name` and
-- `body = coalesce(description, name)` for in_app, and a fixed
-- "Hi {{user_name}}, … — The Live·En·Synergy team" wrapper for email.
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      -- event key,                      in-app subject,                    in-app body
      ('admin.feedback_received',  'New feedback report {{reference}}',
       '{{user_name}} reported a {{kind}}: “{{subject}}”. Reference {{reference}}.'),
      ('feedback.acknowledged',    'Feedback logged as {{reference}}',
       'Thanks — we''ve logged “{{subject}}” as {{reference}} and will pick it up shortly.'),
      ('feedback.resolved',        'Feedback {{reference}} resolved',
       'Your report “{{subject}}” ({{reference}}) has been resolved.'),
      ('campaign.created',         'Campaign {{campaign_reference}} submitted',
       'Your campaign {{campaign_reference}} for {{budget}} is with our team. We''ll come back within 48 hours.'),
      ('admin.campaign_request',   'Campaign {{campaign_reference}} needs matching',
       'A new campaign, {{campaign_reference}}, is waiting to be matched. Budget {{budget}}.'),
      ('campaign.status_changed',  'Campaign {{campaign_reference}} is now {{status}}',
       'Campaign {{campaign_reference}} moved to {{status}}.'),
      ('campaign.matched',         'Campaign {{campaign_reference}} matched',
       'We''ve matched campaign {{campaign_reference}} to {{event_name}}. Review the terms and confirm.'),
      ('campaign.interest_registered', 'Interest registered in {{campaign_reference}}',
       'We''ve passed your interest in {{brand_name}}''s campaign {{campaign_reference}} to the team.'),
      ('admin.campaign_interest',  'Interest in campaign {{campaign_reference}}',
       '{{user_name}} registered interest in {{brand_name}}''s campaign {{campaign_reference}}.'),
      ('sponsorship.confirmed',    'Sponsorship {{reference}} confirmed',
       '{{event_name}} ({{reference}}) is confirmed at {{budget}}. The terms are now locked.'),
      ('sponsorship.artist_agreed','Artist agreed to {{reference}}',
       'The artist has agreed the terms for {{event_name}} ({{reference}}). Yours is the last signature needed.'),
      ('sponsorship.withdrawn',    'Proposal {{reference}} withdrawn',
       '{{event_name}} ({{reference}}) was withdrawn — the sponsor confirmed a different event for this campaign.'),
      ('offer.proposal_received',  'Sponsorship proposal {{reference}}',
       '{{event_name}} ({{reference}}) is awaiting your agreement. Budget {{budget}}.'),
      -- Every token here is always supplied by its call site, with a fallback
      -- string where the value can legitimately be absent. An unresolved token
      -- renders as literal "{{reference}}" in the bell, which is worse than
      -- the generic copy this replaces.
      ('admin.contact_message',    'Enquiry from {{name}} · {{reference}}',
       '{{name}} ({{email}}) wrote in about “{{subject}}”. Reference: {{reference}}.')
    ) as v(key, subject, body)
  loop
    -- in-app: only if untouched since seeding
    update notification_templates nt
       set subject = t.subject,
           body    = t.body
      from notification_events ne
     where ne.key = nt.event_key
       and nt.event_key = t.key
       and nt.channel = 'in_app'
       and nt.subject = ne.name
       and nt.body    = coalesce(ne.description, ne.name);

    -- email: same test against the seeded wrapper
    update notification_templates nt
       set subject = t.subject || ' · Live·En·Synergy',
           body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
                     t.body || chr(10) || chr(10) ||
                     '— The Live·En·Synergy team'
      from notification_events ne
     where ne.key = nt.event_key
       and nt.event_key = t.key
       and nt.channel = 'email'
       and nt.subject = ne.name || ' · Live·En·Synergy'
       and nt.body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
                        coalesce(ne.description, ne.name) || chr(10) || chr(10) ||
                        '— The Live·En·Synergy team';
  end loop;
end
$$;

-- Two of the fourteen don't match the seeded text, because 0017 already
-- rewrote them once to name the event — so the guard above correctly declined
-- to touch them, and they'd have been the only sponsorship notifications still
-- arriving without a reference. They were written by a migration, not by an
-- admin, so they get the same treatment against 0017's exact wording. Anything
-- edited since is still left alone.
update notification_templates set
  subject = 'Sponsorship proposal {{reference}} — {{event_name}}',
  body    = 'A sponsorship for {{event_name}} ({{reference}}) is waiting for your agreement ({{budget}}).'
where event_key = 'offer.proposal_received' and channel = 'in_app'
  and subject = 'Sponsorship proposal for {{event_name}}'
  and body    = 'A sponsorship for {{event_name}} is waiting for your agreement ({{budget}}).';

update notification_templates set
  subject = 'Sponsorship proposal {{reference}} — {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'A sponsorship for {{event_name}} ({{reference}}) is waiting for your agreement ({{budget}}).' || chr(10) || chr(10) ||
            'Review the terms and confirm to make the deal live.' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'offer.proposal_received' and channel = 'email'
  and subject = 'Sponsorship proposal for {{event_name}} · Live·En·Synergy';

update notification_templates set
  subject = 'Sponsorship {{reference}} confirmed — {{event_name}}',
  body    = 'Both parties have agreed — the sponsorship for {{event_name}} ({{reference}}) is live ({{budget}}).'
where event_key = 'sponsorship.confirmed' and channel = 'in_app'
  and subject = 'Sponsorship confirmed for {{event_name}}'
  and body    = 'Both parties have agreed — the sponsorship for {{event_name}} is live ({{budget}}).';

update notification_templates set
  subject = 'Sponsorship {{reference}} confirmed — {{event_name}} · Live·En·Synergy',
  body    = 'Hi {{user_name}},' || chr(10) || chr(10) ||
            'Both parties have agreed — the sponsorship for {{event_name}} ({{reference}}) is live ({{budget}}).' || chr(10) || chr(10) ||
            '— The Live·En·Synergy team'
where event_key = 'sponsorship.confirmed' and channel = 'email'
  and subject = 'Sponsorship confirmed for {{event_name}} · Live·En·Synergy';


-- ---------------------------------------------------------------------------
-- 7. agree_to_sponsorship() — return the withdrawn proposals' references too
--
-- Step 6 has the "your proposal was withdrawn" notification quote a reference,
-- and the caller has no way to look one up: the withdrawn siblings belong to
-- *other* artists, so under RLS the person who just confirmed their own deal
-- reads back nothing for them. The reference has to come out of the function
-- that already has them in hand.
--
-- Verbatim copy of the 0022 definition with `se.reference` added to the
-- `losers` RETURNING and to the jsonb it builds. Nothing else changes — the
-- locking, the conflict checks and every outcome string are as they were.
-- ---------------------------------------------------------------------------
create or replace function agree_to_sponsorship(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event        record;
  v_is_brand     boolean := false;
  v_is_artist    boolean := false;
  v_brand_agreed boolean;
  v_artist_agreed boolean;
  v_clash        record;
  v_withdrawn    jsonb := '[]'::jsonb;
begin
  -- Lock the event for the rest of the transaction. A second agreement on the
  -- same row waits here rather than reading stale flags.
  select * into v_event
    from sponsored_events
   where id = p_event_id
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_party', 'reason', 'That sponsorship no longer exists.');
  end if;

  -- `security definer` bypasses RLS, so authorisation is explicit.
  v_is_artist := v_event.artist_profile_id = auth.uid();
  select exists (
    select 1 from brands b
     where b.id = v_event.brand_id and b.profile_id = auth.uid()
  ) into v_is_brand;

  if not (v_is_brand or v_is_artist) then
    return jsonb_build_object('outcome', 'not_party', 'reason', 'You are not a party to this sponsorship.');
  end if;

  if v_event.status <> 'in_progress' then
    return jsonb_build_object(
      'outcome', 'locked',
      'reason', case v_event.status
                  when 'withdrawn' then 'This proposal was withdrawn — the sponsor confirmed a different event for this campaign.'
                  else 'This sponsorship is already confirmed; its terms are locked.'
                end);
  end if;

  v_brand_agreed  := case when v_is_brand  then not v_event.brand_agreed  else v_event.brand_agreed  end;
  v_artist_agreed := case when v_is_artist then not v_event.artist_agreed else v_event.artist_agreed end;

  -- Not the second agreement — just record it and stop.
  if not (v_brand_agreed and v_artist_agreed) then
    update sponsored_events
       set brand_agreed = v_brand_agreed,
           artist_agreed = v_artist_agreed
     where id = p_event_id;
    return jsonb_build_object(
      'outcome',
      case when (v_is_brand and not v_brand_agreed) or (v_is_artist and not v_artist_agreed)
           then 'withdrew_agreement' else 'agreed' end,
      'reason', null, 'withdrawn', v_withdrawn);
  end if;

  -- This agreement would confirm the deal. Take the campaign lock first so two
  -- siblings can't both get past the checks below, then look for anything
  -- already settled that this would clash with.
  if v_event.campaign_id is not null then
    perform 1 from campaigns where id = v_event.campaign_id for update;

    select se.reference, se.name into v_clash
      from sponsored_events se
     where se.campaign_id = v_event.campaign_id
       and se.id <> p_event_id
       and se.status in ('confirmed', 'completed')
     limit 1;

    if found then
      return jsonb_build_object(
        'outcome', 'conflict',
        'reason', format(
          'This campaign has already been settled on %s. Your agreement was recorded but the sponsorship can''t be confirmed — contact the Live·En·Synergy team.',
          v_clash.name));
    end if;
  end if;

  if v_event.listing_id is not null then
    select se.reference, se.name into v_clash
      from sponsored_events se
     where se.listing_id = v_event.listing_id
       and se.id <> p_event_id
       and se.status in ('confirmed', 'completed')
     limit 1;

    if found then
      return jsonb_build_object(
        'outcome', 'conflict',
        'reason', 'This event is already committed to another confirmed sponsorship. Contact the Live·En·Synergy team.');
    end if;
  end if;

  update sponsored_events
     set brand_agreed = true, artist_agreed = true, status = 'confirmed'
   where id = p_event_id;

  if v_event.campaign_id is not null then
    update campaigns c
       set status = 'closed',
           matched_listing_id = coalesce(v_event.listing_id, c.matched_listing_id)
     where c.id = v_event.campaign_id;

    with losers as (
      update sponsored_events se
         set status = 'withdrawn'
       where se.campaign_id = v_event.campaign_id
         and se.id <> p_event_id
         and se.status = 'in_progress'
      returning se.id, se.reference, se.name, se.artist_profile_id, se.listing_id
    ),
    freed as (
      update event_listings el
         set status = 'available'
       where el.id in (select l.listing_id from losers l where l.listing_id is not null)
         and (v_event.listing_id is null or el.id <> v_event.listing_id)
      returning el.id
    )
    select coalesce(
             jsonb_agg(jsonb_build_object(
               'id', l.id, 'reference', l.reference,
               'name', l.name, 'artist_profile_id', l.artist_profile_id)),
             '[]'::jsonb)
      into v_withdrawn
      from losers l;
  end if;

  return jsonb_build_object('outcome', 'confirmed', 'reason', null, 'withdrawn', v_withdrawn);
end;
$$;

grant execute on function agree_to_sponsorship(uuid) to authenticated;


-- Keep the catalogue's documented variable lists honest — this is what the
-- admin sees listed as available tokens when editing a template.
update notification_events set variables = '{user_name,reference,kind,subject}'
 where key in ('admin.feedback_received', 'feedback.acknowledged', 'feedback.resolved');
update notification_events set variables = '{event_name,reference,budget}'
 where key in ('sponsorship.confirmed', 'offer.proposal_received');
update notification_events set variables = '{event_name,reference,artist_name}'
 where key = 'sponsorship.artist_agreed';
update notification_events set variables = '{event_name,reference}'
 where key = 'sponsorship.withdrawn';
update notification_events set variables = '{name,email,subject,reference}'
 where key = 'admin.contact_message';
update notification_events set variables = '{user_name,campaign_reference,brand_name}'
 where key in ('campaign.interest_registered', 'admin.campaign_interest');
