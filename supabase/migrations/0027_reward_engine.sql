-- =============================================================================
-- Live-En-Synergy — reward engine
--
-- New-model reward tiering ("first 50 surveys get a ticket subsidy, everyone
-- after gets a discount/merch code") and code generation/redemption, which
-- didn't exist before — a released reward was a flat admin-typed £ amount
-- with no code concept at all. This migration adds the tier and code
-- infrastructure; ADMIN DISCRETION decides who gets a code this pass — the
-- survey-completion gate is a later, separate build (see
-- docs/survey-form-builder-design.md and the TODO(survey-gate) comment
-- inside issueRewardCode()).
-- =============================================================================

create table sponsored_event_reward_tiers (
  id                 uuid primary key default gen_random_uuid(),
  sponsored_event_id uuid not null references sponsored_events (id) on delete cascade,
  label              text not null,
  rank               integer not null,
  -- null = uncapped catch-all tier (e.g. "everyone after the first 50").
  participant_cap    integer,
  reward_description text,
  code_type          text check (code_type in ('discount', 'merch')),
  value_label        text,
  value_gbp          numeric(10, 2),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (sponsored_event_id, rank)
);
create index on sponsored_event_reward_tiers (sponsored_event_id);
create trigger sponsored_event_reward_tiers_set_updated_at before update on sponsored_event_reward_tiers
  for each row execute function set_updated_at();

create type reward_code_type   as enum ('discount', 'merch');
create type reward_code_status as enum ('issued', 'redeemed', 'expired', 'void');

create table reward_codes (
  id                 uuid primary key default gen_random_uuid(),
  code               text unique default ('RWD-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  sponsored_event_id uuid not null references sponsored_events (id) on delete cascade,
  participation_id   uuid references participations (id) on delete set null,
  tier_id            uuid references sponsored_event_reward_tiers (id) on delete set null,
  code_type          reward_code_type not null default 'discount',
  -- Snapshotted from the tier at issuance, so a later tier edit doesn't
  -- retroactively change what a participant was already told they got.
  value_label        text,
  value_gbp          numeric(10, 2),
  status             reward_code_status not null default 'issued',
  issued_by          uuid references profiles (id) on delete set null,
  issued_at          timestamptz not null default now(),
  redeemed_at        timestamptz,
  redeemed_by        uuid references profiles (id) on delete set null,
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index on reward_codes (sponsored_event_id);
create index on reward_codes (participation_id);

alter table sponsored_event_reward_tiers enable row level security;
alter table reward_codes enable row level security;

-- Tiers are admin-authored, but both parties should be able to see the
-- structure on their own sponsorship (the new-model spec asks the Sponsored
-- Events screen to show the Reward Engine breakdown to the brand/artist).
create policy "sponsored_event_reward_tiers: parties or admin read"
  on sponsored_event_reward_tiers for select
  using (
    is_admin()
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = sponsored_event_reward_tiers.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  );

create policy "sponsored_event_reward_tiers: admin manage"
  on sponsored_event_reward_tiers for all
  using (is_admin())
  with check (is_admin());

-- A reward code's recipient may read their own row (to see/redeem it); both
-- sponsorship parties may see the event's codes for reporting; only admin
-- issues or edits.
create policy "reward_codes: recipient or parties or admin read"
  on reward_codes for select
  using (
    is_admin()
    or exists (
      select 1 from participations p
      where p.id = reward_codes.participation_id and p.audience_profile_id = auth.uid()
    )
    or exists (
      select 1 from sponsored_events se
      left join brands b on b.id = se.brand_id
      where se.id = reward_codes.sponsored_event_id
        and (b.profile_id = auth.uid() or se.artist_profile_id = auth.uid())
    )
  );

create policy "reward_codes: admin issue"
  on reward_codes for insert
  with check (is_admin());

create policy "reward_codes: admin update"
  on reward_codes for update
  using (is_admin())
  with check (is_admin());

-- No participant-facing UPDATE policy: a row-level policy's WITH CHECK can't
-- restrict which *columns* change, so a broad "recipient may update their
-- own row" policy would let someone edit value_gbp/value_label via the raw
-- client SDK, not just flip status. The self-report-redeemed action instead
-- goes through this narrow security-definer RPC — same idiom as
-- agree_to_sponsorship()/phone_in_use() elsewhere in this schema — which
-- touches only status/redeemed_at/redeemed_by and nothing else.
create or replace function redeem_reward_code(p_code_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update reward_codes rc
  set status = 'redeemed',
      redeemed_at = now(),
      redeemed_by = auth.uid()
  where rc.id = p_code_id
    and rc.status = 'issued'
    and exists (
      select 1 from participations p
      where p.id = rc.participation_id and p.audience_profile_id = auth.uid()
    );
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

grant execute on function redeem_reward_code(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Notification events — same three-step insert as 0006/0008/0025.
-- ---------------------------------------------------------------------------
insert into notification_events (key, name, description, category, audience, variables, sort_order) values
  ('reward.code_issued','Reward code issued','A discount or merch code was issued to you.','account','The participant','{user_name,event_name,code,value_label}',437),
  ('admin.reward_code_redeemed','Reward code redeemed','A participant marked their code as redeemed.','admin','The admin team','{event_name,reference,code}',438)
on conflict (key) do nothing;

insert into notification_settings (event_key)
select key from notification_events
on conflict (event_key) do nothing;

insert into notification_templates (event_key, channel, subject, body)
select e.key, 'in_app', e.name, coalesce(e.description, e.name)
from notification_events e
where not exists (
  select 1 from notification_templates t
  where t.event_key = e.key and t.channel = 'in_app'
);

insert into notification_templates (event_key, channel, subject, body)
select e.key,
       'email',
       e.name || ' · Live·En·Synergy',
       'Hi {{user_name}},' || chr(10) || chr(10) ||
       coalesce(e.description, e.name) || chr(10) || chr(10) ||
       '— The Live·En·Synergy team'
from notification_events e
where not exists (
  select 1 from notification_templates t
  where t.event_key = e.key and t.channel = 'email'
);
