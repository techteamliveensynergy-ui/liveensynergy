-- =============================================================================
-- 0068 — Readable campaign-request references (General Notes, 13 Oct).
--
-- Requests were referenced "INT-7B825C92" (8 random hex characters, 0025) —
-- unreadable over the phone and impossible to order, the same problem 0021
-- fixed for CMP-/EVT-/SPE-/FB-. They become "REQ-00001", numbered in creation
-- order, from a sequence.
--
-- Existing rows are renumbered. References are display-only (every link and
-- foreign key uses the uuid id), so nothing breaks; an old INT- reference
-- quoted in an earlier email simply no longer matches a row. Same technique
-- as 0021 §4. No policy, view or function change.
-- =============================================================================

create sequence if not exists campaign_intake_reference_seq;

with ordered as (
  select id, row_number() over (order by created_at, id) as rn
    from campaign_intake_requests
)
update campaign_intake_requests r
   set reference = 'REQ-' || lpad(o.rn::text, 5, '0')
  from ordered o
 where o.id = r.id;

select setval(
  'campaign_intake_reference_seq',
  coalesce((select count(*) from campaign_intake_requests), 0) + 1,
  false
);

alter table campaign_intake_requests
  alter column reference
  set default ('REQ-' || lpad(nextval('campaign_intake_reference_seq')::text, 5, '0'));
