import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime } from "./format";

/**
 * Upcoming → Open (0070, 14 Oct standup). A paid campaign's agreed event shows
 * to the audience as "Upcoming" with all its details, but registration and the
 * campaign's surveys stay closed until the team opens the campaign. The
 * database enforces it on insert (REGISTRATION_NOT_OPEN / SURVEY_NOT_OPEN);
 * pages ask first so people see "opens soon" rather than a form that fails.
 */

export interface OpenState {
  is_open: boolean;
  opens_at: string | null;
}

/** "Registration opens 1 Nov 2026, 09:00" / "Registration opens soon". */
export function opensLabel(what: string, opensAt: string | null): string {
  return opensAt ? `${what} opens ${formatDateTime(opensAt)}` : `${what} opens soon`;
}

export const REGISTRATION_NOT_OPEN_MESSAGE =
  "Registration for this event hasn't opened yet — check back soon.";

export const SURVEY_NOT_OPEN_TITLE = "This survey isn't open yet";
export const surveyNotOpenBody = (opensAt: string | null) =>
  opensAt
    ? `It opens ${formatDateTime(opensAt)}. Come back then to take part.`
    : "It opens soon — come back once the event's registration is announced.";

/** True when an insert failed because the campaign isn't open (0070 triggers). */
export const isRegistrationNotOpenError = (message: string | null | undefined) =>
  !!message && message.includes("REGISTRATION_NOT_OPEN");
export const isSurveyNotOpenError = (message: string | null | undefined) =>
  !!message && message.includes("SURVEY_NOT_OPEN");

/** Open state per sponsored event (an event with no campaign is always open). */
export async function eventOpenStates(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, OpenState>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.rpc("sponsored_event_open_states", { p_ids: ids });
  return new Map(((data ?? []) as (OpenState & { id: string })[]).map((r) => [r.id, r]));
}

/** Open state of a survey's campaign. Missing → treated as open (the
 *  database still has the final say on submit). */
export async function surveyOpenState(supabase: SupabaseClient, templateId: string): Promise<OpenState> {
  const { data } = await supabase.rpc("survey_open_state", { p_template_id: templateId });
  return ((data ?? []) as OpenState[])[0] ?? { is_open: true, opens_at: null };
}
