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
import { contactOrganiser, registerForEvent } from "./actions";

export const metadata = { title: "Discover events" };

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
    const [{ data }, { data: convData }] = await Promise.all([
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
    ]);

    const conversationByListing = new Map<string, string>();
    for (const c of (convData ?? []) as {
      id: string;
      listing_id: string | null;
    }[]) {
      if (c.listing_id) conversationByListing.set(c.listing_id, c.id);
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
            {listings.map((l) => (
              <div key={l.id} className="card flex flex-col overflow-hidden">
                {l.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.image_url}
                    alt=""
                    className="h-36 w-full object-cover"
                  />
                )}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between">
                    <span className="chip">{l.category ?? "Event"}</span>
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      {l.event_date
                        ? new Date(l.event_date).toLocaleDateString("en-GB")
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
                  {conversationByListing.has(l.id) ? (
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
            ))}
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
      .select("*")
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

  const events = ((data ?? []) as SponsoredEvent[]).filter(
    (e) =>
      matchesText([e.name], q.name) &&
      matchesText([e.location, e.venue_details], q.location) &&
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
              {e.banner_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.banner_url}
                  alt=""
                  className="h-36 w-full object-cover"
                />
              )}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between">
                  <StatusBadge status={e.status} />
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {e.event_date
                      ? new Date(e.event_date).toLocaleDateString("en-GB")
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
                  <form action={registerForEvent} className="mt-4">
                    <input
                      type="hidden"
                      name="sponsored_event_id"
                      value={e.id}
                    />
                    <button type="submit" className="btn btn-primary w-full">
                      Register to attend
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
