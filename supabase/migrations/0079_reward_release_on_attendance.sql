-- 0079 — complete a checked-in participation that already holds its code.
--
-- Since 0075 a code goes out the moment a campaign survey passes, which is
-- usually the pre-event survey, before the event. auto_issue_reward_code()
-- only moves a row to `reward_released` when it is ALREADY
-- `attendance_verified` at the moment it issues; when the person checks in
-- afterwards nothing re-runs it (and it would stop at "already" anyway), so
-- the row stays `attendance_verified` for good. Every "rewarded" count on the
-- admin pages reads `reward_released` and under-counted (found by the
-- 17 Oct end-to-end run, SPE-00029).
--
-- AFTER trigger + definer function, so the nested UPDATE runs as the owner
-- and isn't refused by participations_guard (0061) when the check-in came
-- from a party's own session.

create or replace function public.reward_release_on_attendance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if exists (
      select 1 from reward_codes
       where participation_id = new.id and status <> 'void'
    ) then
      update participations
         set status = 'reward_released',
             reward_released_at = coalesce(reward_released_at, now())
       where id = new.id and status = 'attendance_verified';
    end if;
  exception when others then
    raise warning 'reward_release_on_attendance (participation %) failed: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.reward_release_on_attendance() from public, anon, authenticated;

create or replace trigger participations_release_on_attendance
  after update of status on participations
  for each row
  when (new.status = 'attendance_verified' and old.status is distinct from new.status)
  execute function public.reward_release_on_attendance();

-- Rows already stuck: checked in, holding a live code.
update participations p
   set status = 'reward_released',
       reward_released_at = coalesce(p.reward_released_at, p.attendance_verified_at, now())
 where p.status = 'attendance_verified'
   and exists (
     select 1 from reward_codes c
      where c.participation_id = p.id and c.status <> 'void'
   );
