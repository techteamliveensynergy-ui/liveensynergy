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
