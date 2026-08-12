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
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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

  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: days < 7 ? "long" : undefined,
    day: "numeric",
    month: "short",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
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
