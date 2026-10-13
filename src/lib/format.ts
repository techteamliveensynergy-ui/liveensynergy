/**
 * Every date and time on the platform is shown in UK time. The server runs in
 * UTC (Vercel), so without an explicit zone a server-rendered time read one
 * hour behind during BST (client feedback, 13 Oct).
 */
export const UK_TIME_ZONE = "Europe/London";

/** "YYYY-MM-DD" of the instant's UK calendar day — for "same day?" checks. */
export function ukDayKey(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

/** The instant's UK wall-clock parts (year, month, day, hour, minute). */
function ukParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** `datetime-local` value (`YYYY-MM-DDTHH:mm`) of an instant, in UK time. */
export function ukLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = ukParts(d);
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}

/**
 * A `datetime-local` value typed as UK wall-clock time → ISO instant. Without
 * this the database read "19:00" as 19:00 UTC — 20:00 in summer.
 */
export function ukLocalInputToIso(value: string | null | undefined): string | null {
  const m = value?.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return value?.trim() || null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // UK offset at that moment (0 or +1h); a second pass settles the clock-change edge.
  const offsetAt = (t: number) => {
    const p = ukParts(new Date(t));
    return Date.UTC(+p.y, +p.m - 1, +p.d, +p.h, +p.min) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t).toISOString();
}

/** "DD/MM/YYYY HH:mm" in UK time, for CSV exports. */
export function ukCsvDateTime(iso: string): string {
  const p = ukParts(new Date(iso));
  return `${p.d}/${p.m}/${p.y} ${p.h}:${p.min}`;
}

/** Compact relative time, e.g. "3m ago", "2d ago", "Never". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";

  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return "Just now";

  const units: [number, string][] = [
    [60, "m"],
    [3600, "h"],
    [86400, "d"],
    [2592000, "mo"],
    [31536000, "y"],
  ];

  let label = `${Math.floor(seconds / 31536000)}y`;
  for (let i = 0; i < units.length; i++) {
    const [limit, suffix] = units[i];
    const next = units[i + 1]?.[0];
    if (!next || seconds < next) {
      label = `${Math.floor(seconds / limit)}${suffix}`;
      break;
    }
  }
  return `${label} ago`;
}

/** Absolute date for tooltips / detail rows. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    timeZone: UK_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: UK_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Clock time on its own, e.g. "19:48" — for stamping a chat message. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { timeZone: UK_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

/**
 * Day heading for a run of chat messages: "Today", "Yesterday", then the date.
 * Compared on calendar days rather than elapsed hours, so a message sent at
 * 23:50 doesn't still read "Today" the following morning.
 */
export function formatDayLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  // Whole UK calendar days between the two, via their UK dates at UTC noon
  // (immune to the clock change).
  const noon = (key: string) => new Date(`${key}T12:00:00Z`).getTime();
  const todayKey = ukDayKey(new Date());
  const dayKey = ukDayKey(d);
  const days = Math.round((noon(todayKey) - noon(dayKey)) / 86400000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    timeZone: UK_TIME_ZONE,
    weekday: days < 7 ? "long" : undefined,
    day: "numeric",
    month: "short",
    year: dayKey.slice(0, 4) === todayKey.slice(0, 4) ? undefined : "numeric",
  });
}

/** Adds `days` to an ISO timestamp, returning a new ISO string. */
export function addDays(
  iso: string | null | undefined,
  days: number,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** Buckets a timestamp for the "last active" filter. */
export function activityBucket(
  iso: string | null | undefined,
): "today" | "week" | "month" | "inactive" | "never" {
  if (!iso) return "never";
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (Number.isNaN(days)) return "never";
  if (days < 1) return "today";
  if (days < 7) return "week";
  if (days < 30) return "month";
  return "inactive";
}
