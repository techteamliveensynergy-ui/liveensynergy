import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { DetailFact } from "@/components/campaigns/DetailFact";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";
import { displayUrl } from "@/lib/urls";
import type { EventListing } from "@/lib/types";

export const metadata = { title: "Event" };

/**
 * Read-only view of an event listing — for its owner (a preview of what the
 * team and brands see), admins, and anyone else RLS lets read it (available
 * listings). The chat thread's "Event details" link lands here, so it works
 * for brands and admins too, not only the owning artist (13 Oct).
 */
export default async function EventViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("event_listings").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const l = data as EventListing;

  const isOwner = l.owner_profile_id === profile?.id;
  const back =
    isOwner
      ? { href: "/dashboard/events", label: "← Back to my events" }
      : profile?.role === "admin"
        ? { href: "/dashboard/admin/events", label: "← Back to events" }
        : profile?.role === "brand"
          ? { href: "/dashboard/discover", label: "← Back to discover events" }
          : { href: "/dashboard", label: "← Back to overview" };
  const image = eventImage(l.image_url, l.category);
  const when = formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone }, { weekday: true });
  const where = [l.venue_name, l.city, l.country].filter(Boolean).join(", ");

  return (
    <div>
      <Link href={back.href} className="mb-4 inline-block text-sm text-[var(--color-brand)]">
        {back.label}
      </Link>
      <PageHeader
        title={l.name}
        subtitle={[when, where].filter(Boolean).join(" · ") || undefined}
        action={
          isOwner ? (
            <Link href={`/dashboard/events/${l.id}`} className="btn btn-primary">
              Edit event
            </Link>
          ) : undefined
        }
      />
      {isOwner && (
        <p className="mb-4 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
          This is how your event reads to the Live·En·Synergy team and to brands.
        </p>
      )}

      <div className="card overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.src} alt={image.alt} className="h-56 w-full object-cover md:h-72" />
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-soft)]">
            <StatusBadge status={l.status} />
            <span>Ref {l.reference}</span>
            {l.category && <span className="chip">{l.category}</span>}
          </div>
          <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
            <DetailFact
              label="Date and time"
              value={when ? (l.end_time ? `${when} – ${l.end_time.slice(0, 5)}` : when) : null}
            />
            <DetailFact label="Venue" value={where || null} />
            <DetailFact label="Event audience" value={l.audience_description ?? null} />
            <DetailFact
              label="Capacity"
              value={l.capacity != null ? Number(l.capacity).toLocaleString("en-GB") : null}
            />
            <DetailFact
              label="Ticket price"
              value={l.ticket_price_gbp != null ? `£${Number(l.ticket_price_gbp).toLocaleString("en-GB")}` : null}
            />
            <DetailFact
              label="Tickets"
              value={
                l.ticket_buy_url ? (
                  <a
                    href={l.ticket_buy_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[var(--color-brand-dark)] hover:underline"
                  >
                    {displayUrl(l.ticket_buy_url)} ↗
                  </a>
                ) : null
              }
            />
            <DetailFact label="Partnership budget range" value={l.budget_range} />
            <DetailFact label="Existing partners" value={l.existing_sponsors} />
            <DetailFact label="What partners get" value={l.sponsor_benefits} />
          </dl>
        </div>
      </div>
    </div>
  );
}
