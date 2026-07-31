import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";
import type { AudienceMember, Participation, SponsoredEvent } from "@/lib/types";
import { RegistrationForm } from "./RegistrationForm";

export const metadata = { title: "Event details" };

/**
 * The details step that now precedes registering (aligned 29 Jul). A single
 * click was letting people sign up accidentally, and without ever seeing the
 * reward terms or what they'd be expected to do — which matters, because
 * registering commits them to buying a ticket and later sharing payout details.
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
            "The sponsor hasn't published reward details for this event yet."}
        </p>

        <h2 className="mt-6 text-lg font-semibold">How it works</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-[var(--color-ink-soft)]">
          <li>Register here to take part.</li>
          <li>Buy your ticket to the event as you normally would.</li>
          <li>
            Add your ticket reference under <strong>My events</strong> so we can
            check it.
          </li>
          <li>
            {event.attendance_method
              ? `Attendance is confirmed at the venue: ${event.attendance_method}`
              : "Attend the event — the organiser confirms attendance at the venue."}
          </li>
          <li>
            If you&apos;re selected, confirm your payout details and the reward
            is released to you.
          </li>
        </ol>

        {event.participation_deadline && (
          <p className="mt-4 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
            <span className="font-semibold">Register by </span>
            {new Date(event.participation_deadline).toLocaleString("en-GB", {
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
      ) : deadlinePassed ? (
        <div className="card p-6">
          <p className="rounded-lg bg-[var(--color-pink)] px-4 py-3 text-center text-sm font-semibold text-[var(--color-accent)]">
            Registration for this event has closed.
          </p>
        </div>
      ) : (
        <RegistrationForm
          eventId={event.id}
          eventName={event.name}
          defaultName={member?.full_name ?? profile.full_name ?? ""}
          defaultDateOfBirth={member?.date_of_birth ?? ""}
          defaultPhone={member?.phone ?? ""}
          defaultPhoneCountryCode={member?.phone_country_code ?? "+44"}
        />
      )}
    </div>
  );
}
