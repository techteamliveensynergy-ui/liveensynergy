import { UK_TIME_ZONE } from "@/lib/format";

/**
 * The viewer's own time zone, for the screens where "when did this happen for
 * me?" matters more than "when was it in the UK" — chat (QA 8 Nov: a message
 * sent at 00:59 in India read 19:29). Everywhere else (deadlines, invoices,
 * event times) the platform keeps UK time on purpose.
 *
 * The browser reports its zone into this cookie (<ViewerTimeZoneCookie>, in
 * the dashboard layout), so the server can render the right time with no flash
 * of UK time and no hydration mismatch. Until it has, UK time is used.
 * The server read is viewerTimeZone() in viewer-time-server.ts.
 */
export const VIEWER_TZ_COOKIE = "les_tz";

/** A real IANA zone name, else null — the cookie is client-written, so untrusted. */
export function validTimeZone(value: string | null | undefined): string | null {
  if (!value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return null;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Short label for the zone, e.g. "GMT", "GMT+5:30", for a "times shown in …" hint. */
export function timeZoneLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}
