/**
 * The discount-code set-up deadline (GitHub #58, migration 0091): one week
 * from the sponsored event's creation, capped at two days before the event.
 * The database sets it; this only describes it for the screens and the
 * daily reminder job.
 */

/** The artist is reminded this long before the deadline. */
export const CODES_REMINDER_LEAD_MS = 2 * 24 * 60 * 60 * 1000;

export type CodesDeadlineState =
  | { kind: "none" }
  | { kind: "confirmed"; late: boolean }
  | { kind: "due"; dueAt: string; daysLeft: number }
  | { kind: "overdue"; dueAt: string };

export function codesDeadlineState(
  dueAt: string | null | undefined,
  confirmedAt: string | null | undefined,
  now: number = Date.now(),
): CodesDeadlineState {
  if (confirmedAt) {
    return { kind: "confirmed", late: !!dueAt && new Date(confirmedAt) > new Date(dueAt) };
  }
  if (!dueAt) return { kind: "none" };
  const ms = new Date(dueAt).getTime() - now;
  if (ms < 0) return { kind: "overdue", dueAt };
  return { kind: "due", dueAt, daysLeft: Math.ceil(ms / (24 * 60 * 60 * 1000)) };
}
