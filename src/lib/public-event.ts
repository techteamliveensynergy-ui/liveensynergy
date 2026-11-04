import type { SupabaseClient } from "@supabase/supabase-js";
import { platformLabel } from "./discount-codes";
import { surveyCapacityState } from "./survey-capacity";
import type { RedemptionPlatform } from "./types";

/**
 * The public event page (GitHub #48, migration 0095). Everything here is read
 * through the definer function public_event_page(), which returns null for an
 * event that isn't public (unpaid, closed, withdrawn, or no campaign) — so a
 * page that gets null 404s rather than showing anything.
 */

/** The team's copy for the page (sponsored_event_pages, 0095). */
export interface EventPageCopy {
  event_description: string | null;
  subcategory: string | null;
  age_restriction: string | null;
  ticket_url: string | null;
  research_about: string | null;
  research_why: string | null;
  survey_minutes: number | null;
  eligible_tickets: string | null;
  booking_fees_excluded: boolean | null;
  single_use: boolean | null;
  combinable: boolean | null;
  code_limit_note: string | null;
  offer_lines: string[];
  account_required: boolean;
  participation_limit: string | null;
  eligibility_lines: string[];
  updated_at?: string;
}

export interface PublicEventTier {
  label: string;
  code_type: "discount" | "merch" | null;
  discount_percent: number | null;
  value_label: string | null;
  value_gbp: number | null;
  reward_description: string | null;
  redemption_platform: RedemptionPlatform | null;
  valid_until: string | null;
}

export interface PublicEvent {
  id: string;
  reference: string;
  name: string;
  status: "confirmed" | "completed";
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  timezone: string;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  location: string | null;
  venue_details: string | null;
  category: string | null;
  banner_url: string | null;
  /** The listing's own artwork, for the smaller banner under "About the event". */
  event_image_url: string | null;
  artist_name: string | null;
  campaign_name: string | null;
  campaign_status: "in_progress" | "completed";
  opens_at: string | null;
  is_open: boolean;
  participation_deadline: string | null;
  reward_rules: string | null;
  brand: {
    name: string;
    logo_url: string | null;
    banner_url: string | null;
    description: string | null;
    website_url: string | null;
  } | null;
  page: EventPageCopy | null;
  ticket_url: string | null;
  tiers: PublicEventTier[];
  survey: { id: string; title: string; description: string | null } | null;
}

/** A row of the "Live now" list on /events (public_live_events(), 0095). */
export interface PublicLiveEvent {
  id: string;
  name: string;
  event_date: string | null;
  start_time: string | null;
  timezone: string;
  venue: string | null;
  category: string | null;
  banner_url: string | null;
  artist_name: string | null;
  brand_name: string | null;
  brand_logo_url: string | null;
  is_open: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The event, or null when it isn't public (or the id isn't a uuid, or the
 *  database doesn't have 0095 yet — the page 404s either way). */
export async function getPublicEvent(supabase: SupabaseClient, id: string): Promise<PublicEvent | null> {
  if (!UUID_RE.test(id)) return null;
  const { data, error } = await supabase.rpc("public_event_page", { p_id: id });
  if (error || !data) return null;
  return data as PublicEvent;
}

export async function getPublicLiveEvents(supabase: SupabaseClient): Promise<PublicLiveEvent[]> {
  const { data, error } = await supabase.rpc("public_live_events");
  if (error) return [];
  return (data ?? []) as PublicLiveEvent[];
}

/** "20% off", "£10 off", or the tier's own label for anything else. */
export function discountHeadline(tier: PublicEventTier): string {
  if (tier.discount_percent != null) return `${Number(tier.discount_percent)}% off`;
  if (tier.value_label) return tier.value_label;
  if (tier.value_gbp != null) return `£${Number(tier.value_gbp).toFixed(2).replace(/\.00$/, "")} off`;
  return tier.reward_description || tier.label;
}

/** The best offer, for the hero ("Up to 20% off" when tiers differ). */
export function heroDiscount(tiers: PublicEventTier[]): string | null {
  if (tiers.length === 0) return null;
  const heads = [...new Set(tiers.map(discountHeadline))];
  if (heads.length === 1) return heads[0];
  const pct = tiers.map((t) => t.discount_percent).filter((p): p is number => p != null);
  if (pct.length === tiers.length) return `Up to ${Math.max(...pct.map(Number))}% off`;
  return heads[0];
}

export function redemptionLabel(tiers: PublicEventTier[]): string | null {
  const platforms = [...new Set(tiers.map((t) => platformLabel(t.redemption_platform)).filter(Boolean))];
  return platforms.length ? platforms.join(" / ") : null;
}

/** Latest expiry across the tiers, as a calendar date. */
export function codesValidUntil(tiers: PublicEventTier[]): string | null {
  const dates = tiers.map((t) => t.valid_until).filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/** Calendar date at the event's venue — "has the event happened?" is a
 *  question about the venue's day, not the server's. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

export function eventHasEnded(ev: Pick<PublicEvent, "status" | "campaign_status" | "event_date" | "timezone">) {
  if (ev.status === "completed" || ev.campaign_status === "completed") return true;
  return !!ev.event_date && ev.event_date < todayIn(ev.timezone || "Europe/London");
}

/**
 * What the Start survey area shows. Advice only — the survey page and the
 * database still decide on submit.
 */
export type SurveyCta =
  | { kind: "ended" }
  | { kind: "no_survey" }
  | { kind: "not_open"; opensAt: string | null }
  | { kind: "deadline_passed" }
  | { kind: "closed" }
  | { kind: "open"; surveyId: string; full: boolean; codes: "available" | "exhausted" | "none" };

export async function surveyCta(supabase: SupabaseClient, ev: PublicEvent): Promise<SurveyCta> {
  if (eventHasEnded(ev)) return { kind: "ended" };
  if (!ev.survey) return { kind: "no_survey" };
  if (!ev.is_open) return { kind: "not_open", opensAt: ev.opens_at };
  if (ev.participation_deadline && new Date(ev.participation_deadline) < new Date()) {
    return { kind: "deadline_passed" };
  }
  const [capacity, codesRes] = await Promise.all([
    surveyCapacityState(supabase, ev.survey.id),
    supabase.rpc("survey_codes_state", { p_template_id: ev.survey.id }),
  ]);
  // A database still on 0056 refuses past the cap; on 0083 the survey stays
  // open and late answers wait for review, which the page says.
  if (capacity?.is_full && capacity.refusesWhenFull) return { kind: "closed" };
  const codes = (codesRes.error ? "none" : (codesRes.data as string | null) ?? "none") as
    | "available"
    | "exhausted"
    | "none";
  return { kind: "open", surveyId: ev.survey.id, full: Boolean(capacity?.is_full), codes };
}

/** One line per venue part, skipping blanks. */
export function venueLine(ev: Pick<PublicEvent, "venue_name" | "city" | "country" | "location">): string | null {
  const parts = [ev.venue_name, ev.city, ev.country].filter(Boolean);
  return parts.length ? parts.join(", ") : ev.location || null;
}

/** "19:30" from "19:30:00". */
export function clockTime(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}
