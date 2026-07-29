import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import {
  FilterBar,
  matchesMonth,
  matchesText,
} from "@/components/dashboard/FilterBar";
import { EVENT_CATEGORIES } from "@/lib/constants";
import type { EventListing, SponsoredEvent } from "@/lib/types";
import { contactOrganiser } from "./actions";
import { formatEventDateTime } from "@/lib/event-time";
import { eventImage } from "@/lib/event-images";

export const metadata = { title: "Discover events" };

/**
 * A sponsored event plus the category of the listing behind it — sponsored
 * events carry no category of their own, so that's what the audience-side
 * category filter and the placeholder artwork key on.
 */
type AudienceEvent = SponsoredEvent & {
  event_listings: { category: string | null } | null;
};

interface Search {
  name?: string;
  location?: string;
  category?: string;
  month?: string;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { profile } = await requireRole(["brand", "audience"]);
  const q = await searchParams;
  const supabase = await createClient();
  const hasFilters = Boolean(q.name || q.location || q.category || q.month);

  if (profile.role === "brand") {
    const [{ data }, { data: convData }, { data: brandRow }, { data: sponsData }] =
      await Promise.all([
        supabase
          .from("event_listings")
          .select("*")
          .eq("status", "available")
          .order("event_date", { ascending: true }),
        // Which listings this brand has already reached out about, so the card
        // shows the live conversation instead of offering to start another.
        supabase
          .from("conversations")
          .select("id, listing_id")
          .eq("brand_profile_id", profile.id),
        supabase
          .from("brands")
          .select("id")
          .eq("profile_id", profile.id)
          .maybeSingle<{ id: string }>(),
        // Creating a sponsored event doesn't flip the listing off "available",
        // so without this every listing looks free — including ones this brand
        // has already sponsored. RLS scopes the rows: your own sponsorships
        // always, anyone else's only once confirmed or completed, so an
        // unconfirmed rival proposal stays invisible.
        supabase
          .from("sponsored_events")
          .select("id, listing_id, brand_id")
          .not("listing_id", "is", null),
      ]);

    const conversationByListing = new Map<string, string>();
    for (const c of (convData ?? []) as {
      id: string;
      listing_id: string | null;
    }[]) {
      if (c.listing_id) conversationByListing.set(c.listing_id, c.id);
    }

    const myBrandId = brandRow?.id ?? null;
    const sponsorshipByListing = new Map<string, { id: string; mine: boolean }>();
    for (const s of (sponsData ?? []) as {
      id: string;
      listing_id: string | null;
      brand_id: string | null;
    }[]) {
      if (!s.listing_id) continue;
      const mine = myBrandId != null && s.brand_id === myBrandId;
      const seen = sponsorshipByListing.get(s.listing_id);
      // Your own sponsorship outranks someone else's on the same listing —
      // "you already back this" is the more useful thing to surface.
      if (!seen || (mine && !seen.mine)) {
        sponsorshipByListing.set(s.listing_id, { id: s.id, mine });
      }
    }

    const listings = ((data ?? []) as EventListing[]).filter(
      (l) =>
        matchesText([l.name], q.name) &&
        matchesText([l.venue_name, l.city, l.country], q.location) &&
        (!q.category || l.category === q.category) &&
        matchesMonth(l.event_date, q.month),
    );

    return (
      <div>
        <PageHeader
          title="Discover events"
          subtitle="Events currently open for sponsorship. Reach out and our team will be in touch within 48 hours."
        />

        <FilterBar
          action="/dashboard/discover"
          active={hasFilters}
          fields={[
            {
              name: "name",
              label: "Name",
              type: "text",
              placeholder: "Event name",
              value: q.name,
            },
            {
              name: "location",
              label: "Location",
              type: "text",
              placeholder: "City or venue",
              value: q.location,
            },
            {
              name: "category",
              label: "Category",
              type: "select",
              options: EVENT_CATEGORIES,
              value: q.category,
            },
            { name: "month", label: "Month", type: "month", value: q.month },
          ]}
        />

        {listings.length === 0 ? (
          <EmptyState
            icon="🔎"
            title={hasFilters ? "No events match those filters" : "No events available yet"}
            body={
              hasFilters
                ? "Try widening your search — clear a filter or pick a different month."
                : "Check back soon — artists and organisers are listing events open for sponsorship."
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {listings.map((l) => {
              const sponsorship = sponsorshipByListing.get(l.id) ?? null;
              return (
              <div
                key={l.id}
                className={`card flex flex-col overflow-hidden ${
                  sponsorship?.mine
                    ? "ring-2 ring-[var(--color-brand)]"
                    : sponsorship
                      ? "ring-1 ring-[var(--color-purple-deep)]/25"
                      : ""
                }`}
              >
                {/* Full-width strip rather than a corner chip — whether an
                    event is still open is the first thing to read off a tile. */}
                {sponsorship?.mine ? (
                  <p className="bg-[var(--color-brand)] px-4 py-1.5 text-center text-xs font-semibold text-white">
                    ★ Sponsored by you
                  </p>
                ) : sponsorship ? (
                  <p className="bg-[var(--color-lavender)] px-4 py-1.5 text-center text-xs font-semibold text-[var(--color-purple-deep)]">
                    Already sponsored
                  </p>
                ) : (
                  <p className="bg-[var(--color-sage)] px-4 py-1.5 text-center text-xs font-semibold text-[var(--color-olive-deep)]">
                    Open for sponsorship
                  </p>
                )}
                {/* Falls back to category artwork so a card is never blank. */}
                {(() => {
                  const art = eventImage(l.image_url, l.category);
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={art.src}
                      alt={art.alt}
                      className="h-36 w-full object-cover"
                    />
                  );
                })()}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between">
                    <span className="chip">{l.category ?? "Event"}</span>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {l.event_date
                        ? formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone })
                        : "TBC"}
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold">{l.name}</h3>
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {[l.venue_name, l.city, l.country].filter(Boolean).join(", ")}
                  </p>
                  {l.sponsor_benefits && (
                    <p className="mt-2 line-clamp-3 text-sm text-[var(--color-ink-soft)]">
                      {l.sponsor_benefits}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-[var(--color-ink-soft)]">
                      {l.ticket_price_gbp != null
                        ? `Ticket £${l.ticket_price_gbp}`
                        : ""}
                    </span>
                    <span className="font-semibold">{l.budget_range ?? ""}</span>
                  </div>
                  {sponsorship?.mine ? (
                    // Already yours — an enquiry would just restate that.
                    <Link
                      href={`/dashboard/sponsored/${sponsorship.id}`}
                      className="btn btn-primary mt-4 w-full"
                    >
                      Open your sponsorship
                    </Link>
                  ) : conversationByListing.has(l.id) ? (
                    <div className="mt-4">
                      <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-center text-sm font-semibold text-[var(--color-olive-deep)]">
                        ✓ Enquiry sent
                      </p>
                      <Link
                        href={`/dashboard/messages?c=${conversationByListing.get(l.id)}`}
                        className="btn btn-ghost mt-2 w-full"
                      >
                        Open conversation
                      </Link>
                    </div>
                  ) : (
                    <form action={contactOrganiser} className="mt-4">
                      <input type="hidden" name="listing_id" value={l.id} />
                      <button type="submit" className="btn btn-primary w-full">
                        Contact organiser
                      </button>
                      <p className="mt-2 text-center text-xs text-[var(--color-ink-soft)]">
                        Our team reviews every match and responds within 48
                        hours.
                      </p>
                    </form>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Audience — sponsored events open for participation.
  const now = new Date().toISOString();
  const [{ data }, { data: partData }] = await Promise.all([
    supabase
      .from("sponsored_events")
      // The listing carries the category; sponsored events don't have one.
      .select("*, event_listings(category)")
      .eq("status", "confirmed")
      .or(`participation_deadline.is.null,participation_deadline.gte.${now}`)
      .order("event_date", { ascending: true }),
    // Events this person has already signed up for — registering twice is
    // blocked by a unique constraint anyway, so don't offer it.
    supabase
      .from("participations")
      .select("sponsored_event_id, status")
      .eq("audience_profile_id", profile.id),
  ]);

  const myParticipation = new Map<string, string>();
  for (const p of (partData ?? []) as {
    sponsored_event_id: string;
    status: string;
  }[]) {
    myParticipation.set(p.sponsored_event_id, p.status);
  }

  const events = ((data ?? []) as AudienceEvent[]).filter(
    (e) =>
      matchesText([e.name], q.name) &&
      matchesText([e.location, e.venue_details], q.location) &&
      (!q.category || e.event_listings?.category === q.category) &&
      matchesMonth(e.event_date, q.month),
  );

  return (
    <div>
      <PageHeader
        title="Discover events"
        subtitle="Register for events with sponsor-funded rewards — attend, get verified, get rewarded."
      />

      <FilterBar
        action="/dashboard/discover"
        active={hasFilters}
        fields={[
          {
            name: "name",
            label: "Name",
            type: "text",
            placeholder: "Event name",
            value: q.name,
          },
          {
            name: "location",
            label: "Location",
            type: "text",
            placeholder: "City or venue",
            value: q.location,
          },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: EVENT_CATEGORIES,
            value: q.category,
          },
          { name: "month", label: "Month", type: "month", value: q.month },
        ]}
      />

      {events.length === 0 ? (
        <EmptyState
          icon="🎟️"
          title={hasFilters ? "No events match those filters" : "No events open right now"}
          body={
            hasFilters
              ? "Try widening your search — clear a filter or pick a different month."
              : "Sponsored events with rewards will appear here once they go live."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <div key={e.id} className="card flex flex-col overflow-hidden">
              {(() => {
                const art = eventImage(e.banner_url, e.event_listings?.category);
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={art.src}
                    alt={art.alt}
                    className="h-36 w-full object-cover"
                  />
                );
              })()}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between">
                  <StatusBadge status={e.status} />
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {e.event_date
                      ? formatEventDateTime({ date: e.event_date, time: e.start_time, timeZone: e.timezone })
                      : "TBC"}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{e.name}</h3>
                <p className="text-sm text-[var(--color-ink-soft)]">
                  {e.location ?? e.venue_details ?? ""}
                </p>
                {e.reward_rules && (
                  <div className="mt-3 rounded-xl bg-[var(--color-mist)] px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--color-brand-dark)]">
                      Reward:
                    </span>{" "}
                    {e.reward_rules}
                  </div>
                )}
                {e.participation_deadline && (
                  <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                    Sign up by{" "}
                    {new Date(e.participation_deadline).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                )}
                {myParticipation.has(e.id) ? (
                  <div className="mt-4">
                    <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-center text-sm font-semibold text-[var(--color-olive-deep)]">
                      ✓ You&apos;re registered
                      {myParticipation.get(e.id) !== "registered" && (
                        <span className="ml-1 font-normal">
                          · {myParticipation.get(e.id)!.replace(/_/g, " ")}
                        </span>
                      )}
                    </p>
                    <Link
                      href="/dashboard/participations"
                      className="btn btn-ghost mt-2 w-full"
                    >
                      View my events
                    </Link>
                  </div>
                ) : (
                  // Goes to the details page rather than registering outright,
                  // so nobody signs up by accident or before reading the terms.
                  <Link
                    href={`/dashboard/discover/${e.id}`}
                    className="btn btn-primary mt-4 w-full"
                  >
                    View details &amp; register
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
