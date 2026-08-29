-- =============================================================================
-- Live-En-Synergy — support-only messaging
--
-- 26 Aug: admin becomes the required intermediary between a brand and an
-- artist/organiser (docs/new-model-implementation-plan.md §6). Direct
-- brand<->artist threads (`conversations.kind = 'partner'`) stop being
-- creatable and stop accepting new messages from the two parties themselves.
--
-- This is deliberately NOT a data change — nothing is deleted. Existing
-- partner-kind threads stay fully readable by both original parties and by
-- admin (their history is real conversation, not something to erase), and
-- admin can still post into one if a wind-down message is ever needed
-- ("messages: admin send", added 0023, is untouched). What stops is the two
-- parties themselves opening a *new* partner-kind thread, or adding a *new*
-- message to one — a policy change, reversible by re-applying the old SQL,
-- not a destructive migration.
--
-- "conversations: participants" (0002) was a single `for all` policy; split
-- into read/update (unchanged conditions) and a narrower insert so a
-- non-admin can only create a `kind = 'support'` row. Delete is new — was
-- previously implied by `for all` with no policy actually exercising it from
-- the app; made admin-only explicitly rather than left ambiguous.
-- =============================================================================

drop policy if exists "conversations: participants" on conversations;

create policy "conversations: participants read"
  on conversations for select
  using (
    brand_profile_id = auth.uid()
    or partner_profile_id = auth.uid()
    or is_admin()
  );

create policy "conversations: participants update"
  on conversations for update
  using (
    brand_profile_id = auth.uid()
    or partner_profile_id = auth.uid()
    or is_admin()
  )
  with check (
    brand_profile_id = auth.uid()
    or partner_profile_id = auth.uid()
    or is_admin()
  );

create policy "conversations: insert support or admin"
  on conversations for insert
  with check (
    is_admin()
    or (
      kind = 'support'
      and (brand_profile_id = auth.uid() or partner_profile_id = auth.uid())
    )
  );

create policy "conversations: admin delete"
  on conversations for delete
  using (is_admin());

-- A non-admin may now only send into a thread that is `kind = 'support'`.
-- Read access (existing partner-thread history) and admin-send are untouched.
drop policy if exists "messages: send as participant" on messages;

create policy "messages: send as participant"
  on messages for insert
  with check (
    sender_profile_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = messages.conversation_id
        and (c.brand_profile_id = auth.uid() or c.partner_profile_id = auth.uid())
        and c.kind = 'support'
    )
  );
