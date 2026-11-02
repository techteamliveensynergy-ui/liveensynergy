-- =============================================================================
-- 0102 — any number of chats with the team, each under its own heading.
--
-- Until now a user had exactly one `support` thread with the team: a unique
-- index on conversations (brand, partner, listing, campaign, kind) meant
-- "+ New thread with the team" could only ever reopen the existing one.
--
-- That limit is removed. A user (brands first) can start as many threads as
-- they like, each with its own `subject` ("Payments & invoices", "Discount
-- codes", …). Nothing else relied on the index — no ON CONFLICT clause, no
-- code path — so it is dropped outright. A plain (non-unique) index keeps the
-- per-user thread lookups fast.
--
-- Additive in effect (it only removes a restriction). Re-runnable.
-- =============================================================================

drop index if exists conversations_unique_thread;

create index if not exists conversations_brand_kind_idx
  on conversations (brand_profile_id, kind, created_at);
