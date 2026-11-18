-- =============================================================================
-- 0124 — Tell the artist (and the team) when the brand agrees, and say what
-- happens next (Testing notes 15 Nov + 16 Nov standup: "artist does not know if
-- their event has been pitched and the brand agrees", "difficult to know the
-- brand has confirmed", "the proposal email says to act now but the fulfilment
-- form is still pending").
--
-- 1. sponsorship.brand_agreed (to the artist): the brand agreed to partner with
--    their event, and exactly what comes next. admin.brand_agreed (to the
--    admins): the cue to prepare the artist's fulfilment form.
-- 2. offer.proposal_received no longer tells everyone to "review and confirm
--    now". Its wording ends with a {{next_step}} the sender fills in for the
--    recipient (the artist: the fulfilment form first; the brand: review and
--    agree).
-- 3. When a campaign is paid (0118's trigger), an artist whose event the brand
--    had already agreed gets the "brand agreed" message; one the brand hadn't
--    agreed gets the proposal, with the right next step (the fulfilment form is
--    either still being prepared or already ready).
--
-- Additive and re-runnable.
-- =============================================================================

-- 1 ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('sponsorship.brand_agreed', 'Brand agreed to your event',
   'The brand agreed to partner with an artist''s event. Sent to the artist with what happens next.',
   'artist', 'The artist / organiser', '{user_name,brand_name,event_name,reference,next_step}', 141),
  ('admin.brand_agreed', 'Brand agreed to an event',
   'A brand agreed to partner with an event — prepare the artist''s fulfilment form so they can confirm.',
   'admin', 'The admin team', '{brand_name,event_name,reference}', 450)
on conflict (key) do nothing;

insert into public.notification_settings (event_key)
select key from public.notification_events where key in ('sponsorship.brand_agreed', 'admin.brand_agreed')
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select v.event_key, v.channel, v.subject, v.body
  from (values
    ('sponsorship.brand_agreed', 'in_app', '{{brand_name}} agreed to partner with {{event_name}}',
     '{{brand_name}} has agreed to partner with {{event_name}} ({{reference}}). {{next_step}}'),
    ('sponsorship.brand_agreed', 'email', '{{brand_name}} agreed to partner with {{event_name}} · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'Good news: {{brand_name}} has agreed to partner with {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
     '{{next_step}}' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team'),
    ('admin.brand_agreed', 'in_app', '{{brand_name}} agreed to {{event_name}}',
     '{{brand_name}} agreed to partner with {{event_name}} ({{reference}}). Prepare the artist''s fulfilment form so they can confirm.'),
    ('admin.brand_agreed', 'email', '{{brand_name}} agreed to {{event_name}} · Live·En·Synergy',
     '{{brand_name}} agreed to partner with {{event_name}} ({{reference}}).' || chr(10) || chr(10) ||
     'Next: prepare the artist''s fulfilment form on the partnership page and send it, so they can review and confirm.')
  ) as v(event_key, channel, subject, body)
 where not exists (select 1 from public.notification_templates t where t.event_key = v.event_key and t.channel = v.channel);

-- 2 ---------------------------------------------------------------------------
-- The proposal wording ends with {{next_step}} (every sender supplies it). The
-- old closing sentence is replaced; where an admin already wrote their own
-- wording the token is simply added at the end rather than guessing.
update public.notification_templates
   set body = case
         when body like '%{{next_step}}%' then body
         when position('Review the terms and confirm to make the deal live.' in body) > 0
           then replace(body, 'Review the terms and confirm to make the deal live.', '{{next_step}}')
         else body || ' {{next_step}}'
       end
 where event_key = 'offer.proposal_received' and body not like '%{{next_step}}%';

-- "is waiting for your agreement" read as "act now"; it is a proposal, and the
-- next step says what (if anything) to do.
update public.notification_templates
   set body = replace(body, 'is waiting for your agreement', 'has been proposed'),
       subject = replace(coalesce(subject, ''), 'is waiting for your agreement', 'has been proposed')
 where event_key = 'offer.proposal_received' and body like '%is waiting for your agreement%';

update public.notification_events
   set variables = '{brand_name,event_name,reference,budget,next_step}'
 where key = 'offer.proposal_received';

-- 3 ---------------------------------------------------------------------------
create or replace function public.campaign_paid_reveal_suggestions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_ready boolean;
  v_next  text;
begin
  if old.status = 'awaiting_payment' and new.status = 'in_progress' then
    for r in
      select se.id, se.name, se.reference, se.artist_profile_id, se.listing_id, se.brand_agreed, b.brand_name
        from public.sponsored_events se
        left join public.brands b on b.id = se.brand_id
       where se.campaign_id = new.id and se.status = 'in_progress'
    loop
      if r.listing_id is not null then
        update public.event_listings set status = 'matched' where id = r.listing_id and status = 'available';
      end if;
      if r.artist_profile_id is not null then
        begin
          select coalesce(f.ready_at is not null, false) into v_ready
            from public.sponsored_event_fulfilment f where f.sponsored_event_id = r.id;
          v_next := case when coalesce(v_ready, false)
            then 'Your fulfilment form is ready — open the partnership to review it and confirm.'
            else 'Our team is now preparing your fulfilment form (what you''ll do to promote the partnership, and any special terms). We''ll notify you as soon as it''s ready to review and confirm — there''s nothing for you to do yet.'
          end;
          perform public.notify_from_db(
            case when r.brand_agreed then 'sponsorship.brand_agreed' else 'offer.proposal_received' end,
            r.artist_profile_id,
            jsonb_build_object(
              'brand_name', coalesce(r.brand_name, 'A brand'),
              'event_name', r.name,
              'reference', r.reference,
              'budget', 'as agreed with our team',
              'next_step', v_next
            ),
            '/dashboard/sponsored/' || r.id
          );
        exception when others then
          raise warning 'campaign_paid_reveal_suggestions: notify % failed: %', r.id, sqlerrm;
        end;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.campaign_paid_reveal_suggestions() from public, anon, authenticated;
