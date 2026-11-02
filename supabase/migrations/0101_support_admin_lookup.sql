-- =============================================================================
-- 0101 — a user's first chat with the team could never be created.
--
-- getOrCreateSupportConversation() has to know which admin sits on the other
-- end of a user-started thread. It read that from `profiles`, but RLS only
-- lets a user read their own row, a conversation peer's row, or event
-- participants — and the admin is none of those until a thread exists. So the
-- lookup returned nothing, the function returned null, and every caller
-- silently redirected (to /contact, or back to the page) without a thread.
-- It only surfaced for accounts with no thread yet (new brands/artists/
-- audience); threads the admin started were unaffected (they pass their own
-- id), which is why existing accounts looked fine.
--
-- support_admin_id() hands back exactly one thing: the id of the oldest admin
-- account (the same rule the app already used). Definer, so it isn't subject to
-- the caller's RLS; signed-in users only; no name/email/role is returned.
-- Additive. Re-runnable.
-- =============================================================================

create or replace function support_admin_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles
   where role = 'admin'
   order by created_at asc
   limit 1;
$$;

revoke all on function support_admin_id() from public;
grant execute on function support_admin_id() to authenticated;
