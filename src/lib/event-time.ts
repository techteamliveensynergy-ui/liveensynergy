/**
 * Event date/time formatting.
 *
 * Events store a local calendar date, an optional local clock time, and the
 * IANA zone that clock time belongs to (migration 0013). Formatting resolves
 * the zone abbreviation for that specific date, so an event in July reads BST
 * and one in December reads GMT with no extra bookkeeping — the seasonal switch
 * the 27 Jul standup asked about is handled by the platform's own zone data.
 */

/** Zones offered in the pickers. Kept short and relevant to the audience. */
export const EVENT_TIMEZONES: { value: string; label: string }[] = [
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Dublin", label: "Dublin (GMT/IST)" },
  { value: "Europe/Paris", label: "Paris, Berlin, Madrid (CET/CEST)" },
  { value: "Europe/Lisbon", label: "Lisbon (WET/WEST)" },
  { value: "Europe/Athens", label: "Athens, Helsinki (EET/EEST)" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (SAST)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "Mumbai, Delhi (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "Pacific/Auckland", label: "Auckland (NZST/NZDT)" },
];

export const DEFAULT_TIMEZONE = "Europe/London";

/**
 * Builds the UTC instant for a wall-clock time in a given zone.
 *
 * There's no direct API for this, so it brackets: guess with the offset the
 * zone had at that moment, then correct. Two passes settle it even across a
 * DST boundary.
 */
function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const naive = new Date(`${date}T${time}Z`);
  if (Number.isNaN(naive.getTime())) return null;

  let utc = naive;
  for (let i = 0; i < 2; i++) {
    const offset = offsetMs(utc, timeZone);
    utc = new Date(naive.getTime() - offset);
  }
  return utc;
}

/** How far ahead of UTC `timeZone` is at `instant`, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  // Formatting to an ISO-ish string in the target zone and reading it back as
  // UTC gives the offset as the difference.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  // "24" appears at midnight in some locales' hour12:false output.
  const hour = get("hour") === "24" ? "00" : get("hour");
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(hour),
    Number(get("minute")),
    Number(get("second")),
  );
  return asUtc - instant.getTime();
}

export interface EventTimeParts {
  /** `2026-08-13` */
  date: string | null | undefined;
  /** `19:30:00` or `19:30` */
  time?: string | null;
  timeZone?: string | null;
}

/**
 * "Thu, 13 Aug 2026, 19:30 BST" — or just the date when no time is set.
 * Returns null when there's no date at all, so callers can render "TBC".
 */
export function formatEventDateTime(
  { date, time, timeZone }: EventTimeParts,
  opts: { weekday?: boolean } = {},
): string | null {
  if (!date) return null;
  const zone = timeZone || DEFAULT_TIMEZONE;

  const dateOpts: Intl.DateTimeFormatOptions = {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(opts.weekday ? { weekday: "short" } : {}),
  };

  if (!time) {
    // No clock time — render the calendar date plainly. Parsing as UTC and
    // formatting in UTC avoids the date sliding a day in western zones.
    const dateOnly = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(dateOnly.getTime())) return null;
    return new Intl.DateTimeFormat("en-GB", {
      ...dateOpts,
      timeZone: "UTC",
    }).format(dateOnly);
  }

  const normalisedTime = time.length === 5 ? `${time}:00` : time;
  const instant = zonedToUtc(date, normalisedTime, zone);
  if (!instant) return null;

  return new Intl.DateTimeFormat("en-GB", {
    ...dateOpts,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(instant);
}

/**
 * The real UTC instant an event starts at, for date-cutoff comparisons (e.g.
 * "no changes within 2 days of the event") — `zonedToUtc()` stays private
 * since every other caller only needs display formatting; this is the one
 * that needs a comparable instant. Falls back to midnight when no clock time
 * is set, matching `formatEventDateTime()`'s own no-time behaviour.
 */
export function eventStartInstant({
  date,
  time,
  timeZone,
}: EventTimeParts): Date | null {
  if (!date) return null;
  const zone = timeZone || DEFAULT_TIMEZONE;
  const normalisedTime = time
    ? time.length === 5
      ? `${time}:00`
      : time
    : "00:00:00";
  return zonedToUtc(date, normalisedTime, zone);
}

/** The zone abbreviation alone for a given date, e.g. "BST". */
export function zoneAbbreviation(date: string, timeZone: string): string {
  const instant = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(instant);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}
