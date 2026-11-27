/**
 * Venue location + in-app check-in radius (migration 0126).
 *
 * The venue is stored as coordinates (picked with Google Places, or typed by
 * hand when Places can't find it). An attendee checks in from My events when
 * their phone says they're within the event's radius of those coordinates —
 * the check itself is `check_in_at_location()` in Postgres; this file only
 * shapes form input and wording. Shared by client and server code.
 */

export const METRES_PER_MILE = 1609.344;

/** Default check-in radius: 2 miles (client, 23 Nov). Matches the column default. */
export const DEFAULT_CHECKIN_RADIUS_M = 3219;
/** What an admin may set, in miles — the database allows 150 m – 50 km. */
export const MIN_CHECKIN_RADIUS_MILES = 0.1;
export const MAX_CHECKIN_RADIUS_MILES = 30;

/**
 * A reading less precise than this is refused ("turn on Precise Location").
 * Keep in step with `c_max_accuracy` in check_in_at_location().
 */
export const CHECKIN_MAX_ACCURACY_M = 1000;

export interface VenueLocation {
  venue_address: string | null;
  venue_place_id: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
}

export const NO_VENUE: VenueLocation = {
  venue_address: null,
  venue_place_id: null,
  venue_lat: null,
  venue_lng: null,
};

export function hasVenueLocation(v: Partial<VenueLocation> | null | undefined): boolean {
  return v?.venue_lat != null && v?.venue_lng != null;
}

/** "2 miles", "0.5 miles", "1 mile". */
export function formatMiles(metres: number): string {
  const miles = metres / METRES_PER_MILE;
  const rounded = miles >= 10 ? Math.round(miles) : Math.round(miles * 10) / 10;
  return `${rounded} ${rounded === 1 ? "mile" : "miles"}`;
}

export function milesToMetres(miles: number): number {
  return Math.round(miles * METRES_PER_MILE);
}

export function metresToMiles(metres: number): number {
  return Math.round((metres / METRES_PER_MILE) * 10) / 10;
}

/** A Google Maps link for the pin (works on any device, no key). */
export function mapsLink(v: Partial<VenueLocation>): string | null {
  if (!hasVenueLocation(v)) return null;
  const q = `${v.venue_lat},${v.venue_lng}`;
  const place = v.venue_place_id ? `&query_place_id=${encodeURIComponent(v.venue_place_id)}` : "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}${place}`;
}

/**
 * Reads the venue picker's hidden fields. Both coordinates or neither; an
 * empty picker means "no location" (null everything).
 */
export function venueFromForm(formData: FormData): { error?: string; venue: VenueLocation } {
  const text = (name: string) => {
    const s = String(formData.get(name) ?? "").trim();
    return s || null;
  };
  const latRaw = text("venue_lat");
  const lngRaw = text("venue_lng");
  if (!latRaw && !lngRaw) return { venue: NO_VENUE };

  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return {
      error: "The venue location isn't valid — search for the venue again, or check the coordinates.",
      venue: NO_VENUE,
    };
  }
  return {
    venue: {
      venue_address: text("venue_address")?.slice(0, 500) ?? null,
      venue_place_id: text("venue_place_id")?.slice(0, 300) ?? null,
      venue_lat: Math.round(lat * 1e6) / 1e6,
      venue_lng: Math.round(lng * 1e6) / 1e6,
    },
  };
}

/** Parses "51.4652, -0.1149" (as copied from Google Maps). */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const m = input.trim().match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*\)?$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Radius from the admin form (miles) → metres, clamped to what the DB allows. */
export function radiusFromForm(formData: FormData): { error?: string; metres: number | null } {
  const raw = String(formData.get("checkin_radius_miles") ?? "").trim();
  if (!raw) return { metres: null };
  const miles = Number(raw);
  if (!Number.isFinite(miles) || miles < MIN_CHECKIN_RADIUS_MILES || miles > MAX_CHECKIN_RADIUS_MILES) {
    return {
      error: `The check-in radius must be between ${MIN_CHECKIN_RADIUS_MILES} and ${MAX_CHECKIN_RADIUS_MILES} miles.`,
      metres: null,
    };
  }
  return { metres: Math.min(50000, Math.max(150, milesToMetres(miles))) };
}

/** What an attendee sees for the event's check-in rule. */
export function checkInRuleText(radiusM: number | null | undefined): string {
  return `Check in from My events on the day, within ${formatMiles(radiusM ?? DEFAULT_CHECKIN_RADIUS_M)} of the venue — or scan the QR code at the venue.`;
}

/** Today's date (YYYY-MM-DD) in an IANA zone, for "is it the event day?". */
export function todayIn(timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  }
}
