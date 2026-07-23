-- =============================================================================
-- Live-En-Synergy — admin marketplace oversight (docs/admin-plan1.md Phase B)
--
--  * contact_messages had no screen at all, so submissions were invisible.
--    Adds the handled tracking the inbox needs.
--  * Matching a campaign to a listing is the core admin workflow the product
--    assumes exists, but it was implicit. Makes the link explicit.
-- =============================================================================

alter table contact_messages
  add column handled_at timestamptz,
  add column handled_by uuid references profiles (id) on delete set null;

create index contact_messages_handled_idx
  on contact_messages (handled_at nulls first, created_at desc);

alter table campaigns
  add column matched_listing_id uuid references event_listings (id) on delete set null;

create index campaigns_matched_listing_idx on campaigns (matched_listing_id);

-- Admins need to close the loop on a contact enquiry.
create policy "contact_messages: admin update"
  on contact_messages for update
  using (is_admin()) with check (is_admin());
