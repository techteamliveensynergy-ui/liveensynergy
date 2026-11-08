import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Event cancellation, listing guards, registration cap/waitlist and survey
 * cut-offs (migration 0114, QA 8 Nov). The database enforces all of it; this
 * module holds the shared wording and the small readers pages need, so every
 * screen says the same thing.
 */

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/** A partnership the team cancelled (status is then `withdrawn`). */
export function isCancelledEvent(ev: { status?: string | null; cancelled_at?: string | null } | null | undefined) {
  return Boolean(ev?.cancelled_at);
}

/** The status to show for a partnership: a cancelled one reads "cancelled", not "withdrawn". */
export function sponsorshipStatus(ev: { status: string; cancelled_at?: string | null }): string {
  return ev.cancelled_at ? "cancelled" : ev.status;
}

/** What a partnership is to its listing: in use, finished/cancelled, or never matched. */
export type ListingDealState = "live" | "history" | "none";

export function listingDealState(
  listingId: string,
  deals: { listing_id: string | null; status: string }[],
): ListingDealState {
  const mine = deals.filter((d) => d.listing_id === listingId);
  if (mine.some((d) => d.status === "in_progress" || d.status === "confirmed")) return "live";
  return mine.length > 0 ? "history" : "none";
}

/** The guard's refusals (0114 event_listings_deal_guard), in plain words. */
export function listingErrorMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  if (message.includes("LISTING_IN_USE")) {
    return "This event is part of an active partnership, so it can't be deleted, unpublished or archived. Ask the team to cancel the partnership from its page instead.";
  }
  if (message.includes("LISTING_HAS_HISTORY")) {
    return "This event has partnership history, so it can be archived but not deleted.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registration cap + waitlist
// ---------------------------------------------------------------------------

/**
 * Waitlist = 10% of the cap, rounded up, at least one place. Mirrors
 * event_waitlist_size() (0114). Whole-number percent maths on purpose: in
 * floating point 30 × 0.1 is 3.0000000000000004, which would round up to 4
 * while the database (exact numeric) says 3.
 */
export const EVENT_WAITLIST_PERCENT = 10;
export function waitlistSize(cap: number | null | undefined): number {
  return cap ? Math.max(1, Math.ceil((cap * EVENT_WAITLIST_PERCENT) / 100)) : 0;
}

export const isEventFullError = (message: string | null | undefined) =>
  !!message && message.includes("EVENT_FULL");

export interface EventCapacity {
  cap: number | null;
  registered: number;
  waitlist_size: number;
  waitlisted: number;
  is_full: boolean;
  waitlist_full: boolean;
  /** The caller's place in the queue, or null. */
  my_position: number | null;
}

/** How full an event is (never who). Null when the function isn't there yet. */
export async function eventCapacity(supabase: SupabaseClient, eventId: string): Promise<EventCapacity | null> {
  const { data, error } = await supabase.rpc("event_capacity", { p_event_id: eventId });
  if (error || !data) return null;
  return data as EventCapacity;
}

export type WaitlistJoin =
  | { status: "registered" }
  | { status: "not_full" }
  | { status: "waitlisted"; position: number }
  | { status: "full" };

export async function joinWaitlist(
  supabase: SupabaseClient,
  eventId: string,
  newsletterOptIn = false,
): Promise<{ result?: WaitlistJoin; error?: string }> {
  const { data, error } = await supabase.rpc("join_event_waitlist", {
    p_event_id: eventId,
    p_newsletter_opt_in: newsletterOptIn,
  });
  if (error) return { error: error.message };
  return { result: data as WaitlistJoin };
}

export const EVENT_AND_WAITLIST_FULL_MESSAGE =
  "This event is full and so is its waitlist, so we can't take any more sign-ups. Keep an eye on Discover for other events.";

export function waitlistedMessage(position: number | null | undefined): string {
  return `The event is full, so you're on its waitlist${position ? ` (number ${position})` : ""}. If a place opens up it's yours automatically — we'll email you.`;
}

// ---------------------------------------------------------------------------
// Survey cut-offs
// ---------------------------------------------------------------------------

export type SurveyClosedReason =
  | "campaign_ended"
  | "event_cancelled"
  | "event_passed"
  | "deadline_passed"
  | "full"
  | "not_open";

export const SURVEY_ENDED_COPY: Record<Exclude<SurveyClosedReason, "not_open">, { title: string; body: string }> = {
  campaign_ended: {
    title: "This survey has closed",
    body: "The campaign it belongs to has finished, so it's no longer taking answers. Thank you for your interest.",
  },
  event_cancelled: {
    title: "This event has been cancelled",
    body: "The event this survey was for has been cancelled, so it's no longer taking answers. If you were registered, we've emailed you.",
  },
  event_passed: {
    title: "This survey has closed",
    body: "It was for before the event, and the event has now taken place.",
  },
  deadline_passed: {
    title: "Registration for this event has closed",
    body: "Answering this survey registers you for the event, and the registration deadline has passed.",
  },
  full: {
    title: "This event is full",
    body: "Every place and every waitlist spot has been taken, so the survey isn't taking new people. Keep an eye on Discover for other events.",
  },
};

/** Why the caller can't answer this survey (0114), or null. */
export async function surveyClosedReason(
  supabase: SupabaseClient,
  templateId: string,
): Promise<SurveyClosedReason | null> {
  const { data, error } = await supabase.rpc("survey_closed_reason", { p_template_id: templateId });
  if (error) return null;
  return (data as SurveyClosedReason | null) ?? null;
}

/** The reason in a SURVEY_ENDED:<reason> error from the insert trigger, if any. */
export function surveyEndedReason(message: string | null | undefined): Exclude<SurveyClosedReason, "not_open"> | null {
  const m = message?.match(/SURVEY_ENDED:([a-z_]+)/);
  const reason = m?.[1] as keyof typeof SURVEY_ENDED_COPY | undefined;
  return reason && reason in SURVEY_ENDED_COPY ? reason : null;
}

export function surveyEndedError(message: string | null | undefined): string | null {
  const reason = surveyEndedReason(message);
  if (!reason) return null;
  const c = SURVEY_ENDED_COPY[reason];
  return `${c.title}. ${c.body}`;
}
