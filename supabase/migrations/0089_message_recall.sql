-- =============================================================================
-- 0089 — recall (unsend) a message sent by mistake (GitHub #56).
--
-- 26 Oct General Notes: "Message recall option if sent by mistake". The
-- sender can recall their own message for 15 minutes, and only while it is
-- unread (read_at, 0077). Both sides then see "Message recalled".
--
-- The row stays (so the thread keeps its shape and the read receipts their
-- meaning) with recalled_at set and its text and attachment cleared. The
-- original goes to message_recalls, which only admins can read — for
-- moderation and disputes. It can't stay on the messages row: the other
-- party reads every column of a message they can see.
--
-- recall_message() is the only way in: nobody has an UPDATE policy on
-- messages (0077), and message_recalls has no write policies at all. It
-- returns the attachment's storage path so the app can delete the file as
-- the sender (the "private-uploads: owner delete" policy, 0009) — storage
-- objects can't be removed from SQL.
--
-- Each recall is also written to admin_audit_log (0060), so it shows up
-- alongside the other admin-visible audit events.
--
-- Additive: one nullable column, one new table, one new function.
-- Apply before deploying the code — the messages page reads recalled_at.
-- =============================================================================

alter table messages
  add column if not exists recalled_at timestamptz;

create table if not exists message_recalls (
  message_id       uuid primary key references messages (id) on delete cascade,
  conversation_id  uuid not null references conversations (id) on delete cascade,
  sender_profile_id uuid references profiles (id) on delete set null,
  original_body    text not null,
  attachment_url   text,
  attachment_name  text,
  attachment_type  text,
  sent_at          timestamptz not null,
  recalled_at      timestamptz not null default now()
);
create index if not exists message_recalls_conversation_idx on message_recalls (conversation_id);

alter table message_recalls enable row level security;
drop policy if exists "message_recalls: admin read" on message_recalls;
create policy "message_recalls: admin read" on message_recalls for select using (is_admin());
-- No insert/update/delete policies: rows arrive only through recall_message().
-- Explicit rather than relying on Supabase's default grants; RLS keeps the
-- rows to admins.
revoke all on message_recalls from anon, authenticated;
grant select on message_recalls to authenticated;

create or replace function public.recall_message(p_message_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg messages%rowtype;
  v_window constant interval := interval '15 minutes';
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.' using errcode = '42501';
  end if;

  select * into v_msg from messages where id = p_message_id for update;
  if not found or v_msg.sender_profile_id <> auth.uid() then
    raise exception 'You can only recall a message you sent.' using errcode = '42501';
  end if;
  if v_msg.recalled_at is not null then
    raise exception 'That message has already been recalled.' using errcode = 'P0001';
  end if;
  if v_msg.read_at is not null then
    raise exception 'That message has already been seen, so it can''t be recalled.' using errcode = 'P0001';
  end if;
  if v_msg.created_at < now() - v_window then
    raise exception 'Messages can only be recalled within 15 minutes of sending.' using errcode = 'P0001';
  end if;

  insert into message_recalls (
    message_id, conversation_id, sender_profile_id, original_body,
    attachment_url, attachment_name, attachment_type, sent_at
  ) values (
    v_msg.id, v_msg.conversation_id, v_msg.sender_profile_id, v_msg.body,
    v_msg.attachment_url, v_msg.attachment_name, v_msg.attachment_type, v_msg.created_at
  );

  update messages
     set body = '',
         attachment_url = null,
         attachment_name = null,
         attachment_type = null,
         recalled_at = now()
   where id = v_msg.id;

  insert into admin_audit_log (actor_id, action, target_type, target_id, detail)
  values (
    auth.uid(), 'message.recall', 'message', v_msg.id::text,
    jsonb_build_object(
      'conversation_id', v_msg.conversation_id,
      'sent_at', v_msg.created_at,
      'had_attachment', v_msg.attachment_url is not null
    )
  );

  return jsonb_build_object('attachment_url', v_msg.attachment_url);
end;
$$;
revoke all on function public.recall_message(uuid) from public, anon;
grant execute on function public.recall_message(uuid) to authenticated;
