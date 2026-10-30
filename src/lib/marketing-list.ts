import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_SOURCE_LABELS } from "./consents";
import type { ConsentSource } from "./types";

/**
 * The marketing list (GitHub #62): everyone who currently agrees to receive
 * a partner's newsletter & promotions, one row per person.
 *
 * Where the consent lives: the "Partner newsletter & promotions" tick at
 * event registration, changeable later under My events, sets
 * participations.newsletter_opt_in — that flag is the consent as it stands
 * now, per event. Every change is also written to consent_records (0080,
 * 'sponsor_marketing') by a trigger, which is where the date and the source
 * come from. A person is on the list while at least one event's tick is
 * still on; un-ticking every event takes them off.
 *
 * Excluded: blocked/suspended accounts (profiles.is_active = false) and
 * deleted ones (their participations go with them). Kept but flagged: an
 * address that bounced or complained (email_suppressions), so a bulk send
 * can skip it.
 *
 * Admin-only by RLS on every table read here. Reads page by page — a single
 * PostgREST select stops at 1,000 rows, which would silently cut the list.
 */

export interface MarketingFilters {
  brand?: string | null;
  event?: string | null;
  /** Inclusive UK calendar dates (YYYY-MM-DD) on the latest consent. */
  from?: string | null;
  to?: string | null;
}

export interface MarketingEvent {
  id: string;
  name: string;
  reference: string | null;
  brandId: string | null;
  brandName: string | null;
  consentedAt: string;
  source: string;
}

export interface MarketingPerson {
  profileId: string;
  name: string;
  email: string;
  events: MarketingEvent[];
  latestConsentAt: string;
  latestSource: string;
  suppressed: "bounced" | "complained" | null;
}

interface OptInRow {
  audience_profile_id: string;
  sponsored_event_id: string;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string | null; email: string | null; is_active: boolean } | null;
  sponsored_events: {
    id: string;
    name: string;
    reference: string | null;
    brand_id: string | null;
    brands: { brand_name: string } | null;
  } | null;
}

interface ConsentRow {
  profile_id: string | null;
  granted: boolean;
  source: ConsentSource;
  context: { sponsored_event_id?: string } | null;
  recorded_at: string;
}

const PAGE = 1000;

async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** UK calendar day of an instant, for the date-range filter. */
function ukDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export async function loadMarketingList(
  supabase: SupabaseClient,
  filters: MarketingFilters = {},
): Promise<{ people: MarketingPerson[]; brands: { id: string; name: string }[]; events: { id: string; name: string }[] }> {
  const [optIns, consents, suppressionRows] = await Promise.all([
    readAll<OptInRow>((from, to) =>
      supabase
        .from("participations")
        .select(
          "audience_profile_id, sponsored_event_id, created_at, updated_at, profiles(full_name, email, is_active), sponsored_events(id, name, reference, brand_id, brands(brand_name))",
        )
        .eq("newsletter_opt_in", true)
        .order("id")
        .range(from, to),
    ),
    readAll<ConsentRow>((from, to) =>
      supabase
        .from("consent_records")
        .select("profile_id, granted, source, context, recorded_at")
        .eq("consent_type", "sponsor_marketing")
        .order("recorded_at", { ascending: true })
        .order("id")
        .range(from, to),
    ),
    readAll<{ email: string; reason: "bounced" | "complained" }>((from, to) =>
      supabase.from("email_suppressions").select("email, reason").order("email").range(from, to),
    ),
  ]);

  // Latest consent record per (person, event) — ascending order, so the
  // last write wins.
  const latest = new Map<string, ConsentRow>();
  for (const c of consents) {
    const ev = c.context?.sponsored_event_id;
    if (c.profile_id && ev) latest.set(`${c.profile_id}|${ev}`, c);
  }
  const suppressed = new Map(suppressionRows.map((s) => [s.email.toLowerCase(), s.reason]));

  // Options for the filters: every brand/event anyone is opted in at.
  const brandOptions = new Map<string, string>();
  const eventOptions = new Map<string, string>();
  for (const r of optIns) {
    const ev = r.sponsored_events;
    if (!ev) continue;
    eventOptions.set(ev.id, ev.name);
    if (ev.brand_id && ev.brands) brandOptions.set(ev.brand_id, ev.brands.brand_name);
  }

  const byPerson = new Map<string, MarketingPerson>();
  for (const r of optIns) {
    const ev = r.sponsored_events;
    const p = r.profiles;
    if (!ev || !p || !p.is_active || !p.email) continue;
    if (filters.brand && ev.brand_id !== filters.brand) continue;
    if (filters.event && ev.id !== filters.event) continue;

    const record = latest.get(`${r.audience_profile_id}|${ev.id}`);
    // The flag says "yes" now; a granted record gives when and where. No
    // record (shouldn't happen after 0080's backfill) falls back to the row.
    const consentedAt = record?.granted ? record.recorded_at : r.updated_at ?? r.created_at;
    const source = record?.granted ? (CONSENT_SOURCE_LABELS[record.source] ?? record.source) : "Event registration";
    const entry: MarketingEvent = {
      id: ev.id,
      name: ev.name,
      reference: ev.reference,
      brandId: ev.brand_id,
      brandName: ev.brands?.brand_name ?? null,
      consentedAt,
      source,
    };

    const person = byPerson.get(r.audience_profile_id);
    if (person) {
      person.events.push(entry);
      if (consentedAt > person.latestConsentAt) {
        person.latestConsentAt = consentedAt;
        person.latestSource = source;
      }
    } else {
      byPerson.set(r.audience_profile_id, {
        profileId: r.audience_profile_id,
        name: p.full_name?.trim() || "",
        email: p.email,
        events: [entry],
        latestConsentAt: consentedAt,
        latestSource: source,
        suppressed: suppressed.get(p.email.toLowerCase()) ?? null,
      });
    }
  }

  let people = [...byPerson.values()];
  if (filters.from) people = people.filter((p) => ukDay(p.latestConsentAt) >= filters.from!);
  if (filters.to) people = people.filter((p) => ukDay(p.latestConsentAt) <= filters.to!);
  people.sort((a, b) => (a.latestConsentAt < b.latestConsentAt ? 1 : -1));
  for (const p of people) p.events.sort((a, b) => (a.consentedAt < b.consentedAt ? 1 : -1));

  const sortByName = (m: Map<string, string>) =>
    [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { people, brands: sortByName(brandOptions), events: sortByName(eventOptions) };
}

/** Accepts only YYYY-MM-DD from the query string. */
export function isoDay(v: string | null | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
