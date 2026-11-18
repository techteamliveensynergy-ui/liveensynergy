import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { formatEventDateTime } from "@/lib/event-time";

export const metadata = { title: "Event Passport" };

interface Stamp {
  id: string;
  status: string;
  attendance_verified_at: string | null;
  sponsored_events: {
    name: string;
    reference: string | null;
    event_date: string | null;
    start_time: string | null;
    timezone: string | null;
    location: string | null;
  } | null;
}

/**
 * The audience's Event Passport as its own page (Testing notes 15 Nov: "event
 * passport to be a separate thing in the audience portal"). One stamp per event
 * they checked in at — by scanning the venue's QR code, which is only open on
 * the day of the event — newest first.
 */
export default async function PassportPage() {
  const { profile } = await requireRole(["audience"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("participations")
    .select("id, status, attendance_verified_at, sponsored_events(name, reference, event_date, start_time, timezone, location)")
    .eq("audience_profile_id", profile.id);

  const stamps = ((data ?? []) as unknown as Stamp[])
    .filter((r) => r.attendance_verified_at || ["attendance_verified", "reward_released"].includes(r.status))
    .sort((a, b) => String(b.attendance_verified_at ?? "").localeCompare(String(a.attendance_verified_at ?? "")));

  return (
    <div>
      <PageHeader
        title="🎫 Your Event Passport"
        subtitle={
          stamps.length > 0
            ? `${stamps.length} event${stamps.length === 1 ? "" : "s"} checked in`
            : "Every event you check in at is stamped here."
        }
      />

      <div className="card mb-6 p-5 text-sm text-[var(--color-ink-soft)]" data-testid="passport-howto">
        <p className="font-semibold text-[var(--color-ink)]">How you get a stamp</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>On the day of the event, scan the QR code displayed at the venue.</li>
          <li>
            <strong className="text-[var(--color-ink)]">Check-in is only open on the day of the event</strong> — it
            won&apos;t work before or after.
          </li>
          <li>You need to be registered for the event first (see My events).</li>
        </ul>
      </div>

      {stamps.length === 0 ? (
        <EmptyState
          title="No stamps yet"
          body="Check in at an event on the day and it appears here."
          cta={{ href: "/dashboard/participations", label: "See my events" }}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="passport-stamps">
          {stamps.map((r) => (
            <li key={r.id} className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand)]">Checked in ✓</p>
              <h2 className="mt-1 font-semibold">{r.sponsored_events?.name ?? "Event"}</h2>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                {r.sponsored_events?.event_date
                  ? formatEventDateTime({
                      date: r.sponsored_events.event_date,
                      time: r.sponsored_events.start_time,
                      timeZone: r.sponsored_events.timezone,
                    })
                  : null}
                {r.sponsored_events?.location ? ` · ${r.sponsored_events.location}` : ""}
              </p>
              {r.attendance_verified_at && (
                <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                  Stamped {formatDateTime(r.attendance_verified_at)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm">
        <Link href="/dashboard/participations" className="font-semibold text-[var(--color-brand-dark)] underline">
          ← Back to My events
        </Link>
      </p>
    </div>
  );
}
