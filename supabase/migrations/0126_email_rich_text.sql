-- 0126 — hyperlinks and bold in email bodies and the footer (client, 27 Nov).
-- Admins can now write [text](https://…), **bold**, *italic*, headings, bullets, buttons and dividers in an email body and in the
-- branding footer (src/lib/email/rich-text.ts). Two database-side changes:
--  1. The footer limit goes from 1,000 to 2,000 characters — link syntax costs characters.
--  2. render_notification_tokens() (used by notify_from_db and the triggers) breaks
--     "](" and "**" inside substituted VALUES with a zero-width space, so a brand
--     called "[x](https://evil)" can never become a live link in an email we send.
--     The TypeScript renderTemplate() does the same. Invisible to readers.
-- Re-runnable, additive.

alter table email_branding drop constraint if exists email_branding_footer_text_check;
alter table email_branding
  add constraint email_branding_footer_text_check
  check (footer_text is null or length(footer_text) <= 2000);

create or replace function public.render_notification_tokens(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_out text := p_text;
  v_key text;
  v_val text;
begin
  if p_text is null then
    return null;
  end if;
  for v_key, v_val in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    if v_val is not null and v_val <> '' then
      v_val := replace(replace(v_val, '](', ']' || chr(8203) || '('), '*', '*' || chr(8203));
      v_out := regexp_replace(v_out, '\{\{\s*' || v_key || '\s*\}\}', replace(v_val, '\', '\\'), 'g');
    end if;
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client (27 Nov): "Not allowed to draft invoice on artist behalf."
-- The artist's invoice is theirs: they upload it; the team never drafts or adds
-- one for them. (1) The "please draft it for me" request (0121) is closed: no
-- more inserts (existing rows stay readable). (2) A trigger refuses an
-- `artist_files` row of kind 'invoice' that someone other than the artist adds.
-- ---------------------------------------------------------------------------
drop policy if exists "artist_invoice_requests: artist insert" on public.artist_invoice_requests;
revoke insert on public.artist_invoice_requests from authenticated;

create or replace function public.artist_files_invoice_by_artist_only()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'invoice' and new.uploaded_by is distinct from new.artist_profile_id then
    raise exception 'INVOICE_BY_ARTIST_ONLY' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists artist_files_invoice_by_artist_only on public.artist_files;
create trigger artist_files_invoice_by_artist_only
  before insert on public.artist_files
  for each row execute function public.artist_files_invoice_by_artist_only();

-- ---------------------------------------------------------------------------
-- Testing notes 15 Nov: "Artist does not know if one of their events has been
-- pitched". The team can suggest an event to a brand before the campaign is paid
-- (0118), and the artist can't see it until then — but they should hear that
-- their event has been put forward. offer.event_pitched is that heads-up: no
-- brand name, no budget (those come with the proposal once the campaign is paid).
-- ---------------------------------------------------------------------------
insert into public.notification_events (key, name, description, category, audience, variables, sort_order) values
  ('offer.event_pitched', 'Your event has been put forward',
   'The team suggested an artist''s event to a brand for a campaign. A heads-up only — the details come once the campaign is paid.',
   'artist', 'The artist / organiser', '{user_name,event_name}', 142)
on conflict (key) do nothing;

insert into public.notification_settings (event_key)
select key from public.notification_events where key = 'offer.event_pitched'
on conflict (event_key) do nothing;

insert into public.notification_templates (event_key, channel, subject, body)
select v.event_key, v.channel, v.subject, v.body
  from (values
    ('offer.event_pitched', 'in_app', '{{event_name}} has been put forward to a brand',
     'Our team has put {{event_name}} forward to a brand for a campaign. Nothing for you to do yet — we''ll tell you as soon as there''s a proposal to review.'),
    ('offer.event_pitched', 'email', '{{event_name}} has been put forward to a brand · Live·En·Synergy',
     'Hi {{user_name}},' || chr(10) || chr(10) ||
     'Good news: our team has put {{event_name}} forward to a brand for a campaign.' || chr(10) || chr(10) ||
     'There''s nothing for you to do yet. If the brand goes ahead, we''ll send you the partnership details and the next steps, and tell you what to do then.' || chr(10) || chr(10) ||
     '— The Live·En·Synergy team')
  ) as v(event_key, channel, subject, body)
 where not exists (select 1 from public.notification_templates t where t.event_key = v.event_key and t.channel = v.channel);
