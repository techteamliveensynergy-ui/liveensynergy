-- =============================================================================
-- Live-En-Synergy — email delivery (docs/payments-email-implementation-plan.md,
-- Phase A).
--
-- Until now every notification queued an email_outbox row and nothing sent it.
-- This migration gives the outbox what a sender needs: retry bookkeeping, a
-- 'sending' claim state, delivery feedback from the provider's webhook, a
-- suppression list, and a claim RPC that is safe under concurrent workers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Outbox bookkeeping
-- ---------------------------------------------------------------------------
alter table email_outbox
  add column if not exists attempts        int         not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists last_attempt_at timestamptz,
  add column if not exists delivery_status text,
  add column if not exists delivered_at    timestamptz;

-- 'sending' = claimed by a worker. A row stuck there (worker died mid-send) is
-- re-claimed after 10 minutes by claim_outbox_batch().
alter table email_outbox drop constraint if exists email_outbox_status_check;
alter table email_outbox
  add constraint email_outbox_status_check
  check (status in ('queued', 'sending', 'sent', 'failed', 'skipped'));

create index if not exists email_outbox_due_idx
  on email_outbox (status, next_attempt_at);
create index if not exists email_outbox_provider_message_idx
  on email_outbox (provider_message_id)
  where provider_message_id is not null;

-- Semantic backfill (L4): the status column now means "will actually be sent".
-- Everything queued before this migration was queued when no provider
-- existed; sending months-old notifications the moment a provider is wired
-- would email people about events long past. Mark them skipped instead — an
-- admin can still retry any single one from the outbox page.
update email_outbox
   set status = 'skipped',
       error  = 'pre-provider backlog — not sent'
 where status = 'queued';

-- ---------------------------------------------------------------------------
-- Suppression list — addresses that bounced or marked us as spam. The sender
-- refuses to mail these; an admin can remove one (delete policy below).
-- ---------------------------------------------------------------------------
create table if not exists email_suppressions (
  email             text primary key check (email = lower(email)),
  reason            text not null check (reason in ('bounced', 'complained')),
  provider_event_id text,
  created_at        timestamptz not null default now()
);

alter table email_suppressions enable row level security;

create policy "email_suppressions: admin read"
  on email_suppressions for select using (is_admin());
create policy "email_suppressions: admin delete"
  on email_suppressions for delete using (is_admin());
-- No insert/update policy: only the service role (the Resend webhook) writes.

-- ---------------------------------------------------------------------------
-- claim_outbox_batch — atomically take up to p_limit due rows.
--
-- `for update skip locked` means two workers (the post-request send and the
-- 5-minute cron) never take the same row. Taking a row bumps `attempts` in the
-- same statement, so a worker that dies mid-send still counts the attempt and
-- a poison row can't be retried forever.
-- ---------------------------------------------------------------------------
create or replace function claim_outbox_batch(p_limit int default 10)
returns setof email_outbox
language sql
security definer
set search_path = public
as $$
  update email_outbox o
     set status          = 'sending',
         attempts        = o.attempts + 1,
         last_attempt_at = now()
   where o.id in (
     select id
       from email_outbox
      where (status = 'queued' and next_attempt_at <= now())
         or (status = 'sending' and last_attempt_at < now() - interval '10 minutes')
      order by created_at
      limit greatest(p_limit, 0)
        for update skip locked
   )
  returning o.*;
$$;

revoke all on function claim_outbox_batch(int) from public, anon, authenticated;
grant execute on function claim_outbox_batch(int) to service_role;

-- ---------------------------------------------------------------------------
-- notify() will also run from webhook/cron routes that have no signed-in user
-- (the payment webhook in Phase B). Let the service role call the enqueue RPC.
-- ---------------------------------------------------------------------------
grant execute on function enqueue_notification(
  text, uuid, text, text, text, text, text[], text[], text, text
) to service_role;
