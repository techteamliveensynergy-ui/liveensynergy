import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/Logo";
import { formatEventDateTime } from "@/lib/event-time";
import { CheckInButton } from "@/components/attend/CheckInButton";
import { CHECKIN_RESULT_MESSAGES } from "@/lib/checkin-copy";
import { confirmAttendance } from "./actions";

export const metadata = { title: "Confirm attendance" };

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-mist)] p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-8">{children}</div>
      </div>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: ReactNode;
}) {
  return (
    <>
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <h1 className="mt-3 font-display text-xl font-semibold text-[var(--color-ink)]">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
        {body}
      </p>
    </>
  );
}

/**
 * The page behind the per-event QR code an artist displays at the venue.
 * Scanning it (or following the link) lands the audience member here to
 * self-confirm their attendance, instead of the organiser verifying each
 * person by hand — see `attendance_qr_token` on `sponsored_events`.
 */
export default async function AttendPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  const { token } = await params;
  const { result } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/sign-in?redirectTo=/attend/${token}`);
  }

  const { data: event } = await supabase
    .from("sponsored_events")
    .select("id, name, event_date, start_time, timezone, venue_lat, venue_lng")
    .eq("attendance_qr_token", token)
    .maybeSingle();

  if (!event) {
    return (
      <Shell>
        <StatusCard
          icon="❓"
          title="Check-in link not recognised"
          body="This QR code or link doesn't match a Live·En·Synergy event. Ask the artist or organiser to double-check it."
        />
      </Shell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "audience") {
    return (
      <Shell>
        <StatusCard
          icon="🎫"
          title="Audience check-in only"
          body="Sign in with the audience account you registered with to confirm your attendance."
        />
      </Shell>
    );
  }

  const { data: participation } = await supabase
    .from("participations")
    .select("id, status, selected")
    .eq("sponsored_event_id", event.id)
    .eq("audience_profile_id", user.id)
    .maybeSingle();

  const when = formatEventDateTime({
    date: event.event_date,
    time: event.start_time,
    timeZone: event.timezone,
  });

  if (!participation) {
    return (
      <Shell>
        <StatusCard
          icon="🔍"
          title="You're not registered for this event"
          body={`We couldn't find a registration for ${event.name} on this account. Register from Discover events first.`}
        />
        <Link href="/dashboard/discover" className="btn btn-primary mt-6 w-full">
          Discover events
        </Link>
      </Shell>
    );
  }

  if (participation.status === "attendance_verified" || participation.status === "reward_released") {
    return (
      <Shell>
        <StatusCard
          icon="✅"
          title="Attendance confirmed"
          body={`You're checked in to ${event.name}${when ? ` (${when})` : ""}. Thanks for coming — complete the post-event survey in My events to receive your discount code.`}
        />
        <Link href="/dashboard/participations" className="btn btn-primary mt-6 w-full">
          Go to my events
        </Link>
      </Shell>
    );
  }

  if (participation.status === "rejected" || !participation.selected) {
    return (
      <Shell>
        <StatusCard
          icon="⏳"
          title="Not yet selected for this event"
          body="Attendance check-in opens once you've been selected. If you're at the venue, enjoy the show — check My events for updates."
        />
        <Link href="/dashboard/participations" className="btn btn-ghost mt-6 w-full">
          Go to my events
        </Link>
      </Shell>
    );
  }

  const refused = result ? CHECKIN_RESULT_MESSAGES[result] : undefined;

  return (
    <Shell>
      {refused && (
        <div className="mb-6 rounded-xl bg-[var(--color-gold)]/40 p-4 text-left text-sm" role="alert">
          <p className="font-semibold text-[var(--color-ink)]">{refused.title}</p>
          <p className="mt-1 text-[var(--color-ink-soft)]">{refused.body}</p>
        </div>
      )}
      <StatusCard
        icon="📍"
        title="Confirm you're here"
        body={`Tap below to confirm you're attending ${event.name}${when ? ` (${when})` : ""}. Once you're checked in, the post-event survey unlocks in My events — complete it to receive your discount code.`}
      />
      <CheckInButton
        action={confirmAttendance}
        fields={{ token, participation_id: participation.id }}
        needsLocation={event.venue_lat != null && event.venue_lng != null}
      />
    </Shell>
  );
}
