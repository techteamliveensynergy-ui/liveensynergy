import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { CheckInButton } from "@/components/attend/CheckInButton";
import { CHECKIN_RESULT_MESSAGES, CHECKIN_RULE } from "@/lib/checkin-copy";
import { formatEventDateTime } from "@/lib/event-time";
import { confirmAttendanceInApp } from "@/app/attend/[token]/actions";

export const metadata = { title: "Check in" };

/**
 * The in-app way to check in (0127): no QR code, so it only works at a venue
 * the team has pinned on the map, and only once the person is within its
 * radius. The same rule and refusals as the QR page; the database decides.
 */
export default async function InAppCheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ participationId: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  await requireRole(["audience"]);
  const { participationId } = await params;
  const { result } = await searchParams;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("participations")
    .select("id, status, selected, sponsored_events(name, event_date, start_time, timezone, venue_details, venue_lat, venue_lng, attendance_qr_token)")
    .eq("id", participationId)
    .maybeSingle();
  if (!p) redirect("/dashboard/participations");

  const ev = (Array.isArray(p.sponsored_events) ? p.sponsored_events[0] : p.sponsored_events) as {
    name: string;
    event_date: string | null;
    start_time: string | null;
    timezone: string | null;
    venue_details: string | null;
    venue_lat: number | null;
    venue_lng: number | null;
  } | null;
  if (!ev) redirect("/dashboard/participations");

  const when = formatEventDateTime({ date: ev.event_date, time: ev.start_time, timeZone: ev.timezone });
  const done = p.status === "attendance_verified" || p.status === "reward_released";
  const hasPoint = ev.venue_lat != null && ev.venue_lng != null;
  const refused = result ? CHECKIN_RESULT_MESSAGES[result] : undefined;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Check in" subtitle={`${ev.name}${when ? ` · ${when}` : ""}`} />
      <div className="card space-y-4 p-6 text-center">
        {done ? (
          <>
            <div className="text-4xl" aria-hidden>✅</div>
            <h2 className="font-display text-xl font-semibold">You&apos;re checked in</h2>
            <p className="text-sm text-[var(--color-ink-soft)]">
              It&apos;s stamped in your Event Passport. Complete the post-event survey in My events to receive your
              discount code.
            </p>
            <Link href="/dashboard/passport" className="btn btn-primary w-full">
              See my Event Passport
            </Link>
          </>
        ) : (
          <>
            {refused && (
              <div className="rounded-xl bg-[var(--color-gold)]/40 p-4 text-left text-sm" role="alert">
                <p className="font-semibold">{refused.title}</p>
                <p className="mt-1 text-[var(--color-ink-soft)]">{refused.body}</p>
              </div>
            )}
            <div className="text-4xl" aria-hidden>📍</div>
            <h2 className="font-display text-xl font-semibold">Check in at the venue</h2>
            <p className="text-sm text-[var(--color-ink-soft)]">{CHECKIN_RULE}</p>
            {hasPoint ? (
              <CheckInButton
                action={confirmAttendanceInApp}
                fields={{ participation_id: p.id }}
                needsLocation
                label="Check me in"
              />
            ) : (
              <p className="rounded-xl bg-[var(--color-mist)] p-4 text-sm text-[var(--color-ink-soft)]">
                In-app check-in isn&apos;t set up for this event. Scan the QR code shown at the venue instead.
              </p>
            )}
          </>
        )}
        <Link href="/dashboard/participations" className="btn btn-ghost w-full">
          Back to My events
        </Link>
      </div>
    </div>
  );
}
