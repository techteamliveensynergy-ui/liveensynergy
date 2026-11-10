import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";
import type { AudienceMember, Participation, SponsoredEvent } from "@/lib/types";
import { RegistrationForm } from "./RegistrationForm";
import { leaveWaitlist } from "../actions";
import { EVENT_AND_WAITLIST_FULL_MESSAGE, eventCapacity } from "@/lib/event-safety";
import { eventOpenStates, opensLabel } from "@/lib/campaign-opening";
import { UK_TIME_ZONE } from "@/lib/format";

export const metadata = { title: "Event details" };

/**
 * The details step that now precedes registering (aligned 29 Jul). A single
 * click was letting people sign up accidentally, and without ever seeing the
 * reward terms or what they'd be expected to do — which matters, because
 * registering commits them to buying a ticket if they're selected.
 */
export default async function EventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRole(["audience"]);
  const supabase = await createClient();

  const [{ data: ev }, { data: member }, { data: existing }] = await Promise.all([
    supabase
      .from("sponsored_events")
      .select("*")
      .eq("id", id)
      .eq("status", "confirmed")
      .maybeSingle(),
    supabase
      .from("audience_members")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle<AudienceMember>(),
    supabase
      .from("participations")
      .select("id, status")
      .eq("sponsored_event_id", id)
      .eq("audience_profile_id", profile.id)
      .maybeSingle<Pick<Participation, "id" | "status">>(),
  ]);

  if (!ev) notFound();
  const event = ev as SponsoredEvent;
  // Upcoming → Open (0070): shown with all its details, but registration
  // waits until the team opens the campaign.
  const openState = (await eventOpenStates(supabase, [event.id])).get(event.id) ?? { is_open: true, opens_at: null };

  // Registration limit + waitlist (0114). Null when there's no limit or the
  // migration isn't in yet — the form then behaves as before.
  const capacity = existing ? null : await eventCapacity(supabase, event.id);
  const onWaitlist = capacity?.my_position != null;
  const full = Boolean(capacity?.is_full);
  const fullAndWaitlistFull = full && Boolean(capacity?.waitlist_full) && !onWaitlist;

  const deadlinePassed =
    event.participation_deadline != null &&
    new Date(event.participation_deadline) < new Date();

  const when = formatEventDateTime(
    {
      date: event.event_date,
      time: event.start_time,
      timeZone: event.timezone,
    },
    { weekday: true },
  );

  const artwork = eventImage(event.banner_url, null);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/discover"
        className="inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to discover
      </Link>

      <PageHeader
        title={event.name}
        subtitle={[when, event.location ?? event.venue_details]
          .filter(Boolean)
          .join(" · ")}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artwork.src}
        alt={artwork.alt}
        className="h-56 w-full rounded-2xl object-cover"
      />

      <div className="card p-6">
        <h2 className="text-lg font-semibold">What you get</h2>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          {event.reward_rules ??
            "The partner hasn't published reward details for this event yet."}
        </p>

        <h2 className="mt-6 text-lg font-semibold">How it works</h2>
        {/* The current model (Testing notes 7 Nov) — no draw, no ticket upload.
            Interim wording until the client's final copy. */}
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-[var(--color-ink-soft)]">
          <li>Register here — it takes a minute.</li>
          <li>Answer the event&apos;s short survey under <strong>My events</strong>.</li>
          <li>
            We check every response. Once yours passes, your discount code appears under My events and My rewards, and
            we email it to you.
          </li>
          <li>Use your code when you buy your ticket on the event&apos;s ticketing site.</li>
          <li>
            {event.attendance_method
              ? `On the day, remember to check in at the venue (${event.attendance_method}) — it adds the event to your Event Passport.`
              : "On the day, remember to check in at the venue by scanning the QR code — it adds the event to your Event Passport."}
          </li>
        </ol>

        {event.participation_deadline && (
          <p className="mt-4 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
            <span className="font-semibold">Register by </span>
            {new Date(event.participation_deadline).toLocaleString("en-GB", {
              timeZone: UK_TIME_ZONE,
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>

      {existing ? (
        <div className="card p-6">
          <p className="rounded-lg bg-[var(--color-sage)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-olive-deep)]">
            ✓ You&apos;re already registered for this event
          </p>
          <Link
            href="/dashboard/participations"
            className="btn btn-primary mt-4 w-full"
          >
            Go to my events
          </Link>
        </div>
      ) : !openState.is_open ? (
        <div className="card p-6 text-center">
          <span className="chip">Upcoming</span>
          <p className="mt-3 text-lg font-semibold">{opensLabel("Registration", openState.opens_at)}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            You&apos;ll be able to register and take the pre-event survey here once it opens.
          </p>
        </div>
      ) : deadlinePassed ? (
        <div className="card p-6">
          <p className="rounded-lg bg-[var(--color-pink)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-accent)]">
            Registration for this event has closed.
          </p>
        </div>
      ) : onWaitlist ? (
        <div id="waitlist" className="card p-6 text-center">
          <span className="chip">Waitlist</span>
          <p className="mt-3 text-lg font-semibold">You&apos;re number {capacity?.my_position} on the waitlist</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            If a place opens up it&apos;s yours automatically, and we&apos;ll email you.
          </p>
          <form action={leaveWaitlist} className="mt-4">
            <input type="hidden" name="sponsored_event_id" value={event.id} />
            <button type="submit" className="btn btn-ghost text-sm">Leave the waitlist</button>
          </form>
        </div>
      ) : fullAndWaitlistFull ? (
        <div className="card p-6">
          <p className="rounded-lg bg-[var(--color-pink)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-accent)]">
            {EVENT_AND_WAITLIST_FULL_MESSAGE}
          </p>
        </div>
      ) : (
        <RegistrationForm
          waitlistOnly={full}
          eventId={event.id}
          eventName={event.name}
          defaultName={member?.full_name ?? profile.full_name ?? ""}
          defaultPhone={member?.phone ?? ""}
          defaultPhoneCountryCode={member?.phone_country_code ?? "+44"}
        />
      )}
    </div>
  );
}
