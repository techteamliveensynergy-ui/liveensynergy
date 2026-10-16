-- =============================================================================
-- 0077 — Chat read receipts (13 Oct General Notes: "read / delivered ticks").
--
-- messages.read_at has existed since the messaging tables were created but
-- nothing ever wrote it. Opening a thread now calls
-- mark_conversation_read(conversation), which stamps read_at on the messages
-- the caller has *received*:
--   * a party (the brand / artist / audience member) — every message not
--     sent by them, i.e. the team's replies;
--   * an admin — every message sent by a party (not by another admin: the
--     team's own messages are read by the user, not by a colleague).
-- The sender then sees "Seen" under their message instead of "Sent".
--
-- A definer function because nobody has an UPDATE policy on messages (and
-- shouldn't — it would let a party edit what was said). Only read_at moves,
-- only from null, only in a conversation the caller may read.
-- =============================================================================

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv  conversations%rowtype;
  v_count integer;
begin
  select * into v_conv from conversations where id = p_conversation_id;
  if not found or auth.uid() is null then
    return 0;
  end if;

  if auth.uid() in (v_conv.brand_profile_id, v_conv.partner_profile_id) then
    update messages
       set read_at = now()
     where conversation_id = p_conversation_id
       and read_at is null
       and sender_profile_id <> auth.uid();
  elsif is_admin() then
    update messages
       set read_at = now()
     where conversation_id = p_conversation_id
       and read_at is null
       and sender_profile_id in (v_conv.brand_profile_id, v_conv.partner_profile_id);
  else
    return 0;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
