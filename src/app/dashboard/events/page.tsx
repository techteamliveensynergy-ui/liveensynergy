import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { EventListing, SponsoredEvent } from "@/lib/types";
import { toggleListingStatus, deleteListing } from "./actions";

export const metadata = { title: "My events" };

type Tab = "published" | "sponsored";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { profile } = await requireRole(["artist", "event"]);
  const { tab: rawTab } = await searchParams;
  const tab: Tab = rawTab === "sponsored" ? "sponsored" : "published";
  const supabase = await createClient();

  const [{ data: listingData }, { data: sponsoredData }] = await Promise.all([
    supabase
      .from("event_listings")
      .select("*")
      .eq("owner_profile_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sponsored_events")
      .select("*")
      .eq("artist_profile_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  const listings = (listingData ?? []) as EventListing[];
  const sponsored = (sponsoredData ?? []) as SponsoredEvent[];

  return (
    <div>
      <PageHeader
        title="My events"
        subtitle="Events you've listed for sponsorship, and the sponsorships you've agreed."
        action={
          <Link href="/dashboard/events/new" className="btn btn-primary">
            + New event
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <TabLink
          href="/dashboard/events"
          label="My published events"
          count={listings.length}
          active={tab === "published"}
        />
        <TabLink
          href="/dashboard/events?tab=sponsored"
          label="My sponsored events"
          count={sponsored.length}
          active={tab === "sponsored"}
        />
      </div>

      {tab === "published" ? (
        listings.length === 0 ? (
          <EmptyState
            icon="🎫"
            title="No events yet"
            body="List your first event and open it up for sponsorship."
            cta={{ href: "/dashboard/events/new", label: "Create an event" }}
          />
        ) : (
          <div className="space-y-3">
            {listings.map((l) => (
              <div
                key={l.id}
                className="card flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="flex items-center gap-4">
                  {l.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.image_url}
                      alt=""
                      className="h-14 w-20 rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{l.name}</h3>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {[
                        l.event_date &&
                          new Date(l.event_date).toLocaleDateString("en-GB"),
                        l.venue_name,
                        l.city,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No date set"}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                      Listing ref {l.reference}
                      {l.budget_range ? ` · ${l.budget_range}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleListingStatus}>
                    <input type="hidden" name="id" value={l.id} />
                    <input
                      type="hidden"
                      name="next_status"
                      value={l.status === "available" ? "draft" : "available"}
                    />
                    <button className="btn btn-ghost text-sm" type="submit">
                      {l.status === "available" ? "Unpublish" : "Publish"}
                    </button>
                  </form>
                  <Link
                    href={`/dashboard/events/${l.id}`}
                    className="btn btn-ghost text-sm"
                  >
                    Edit
                  </Link>
                  <form action={deleteListing}>
                    <input type="hidden" name="id" value={l.id} />
                    <button
                      className="btn btn-ghost text-sm text-[var(--color-accent)]"
                      type="submit"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )
      ) : sponsored.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="No sponsored events yet"
          body="Browse the campaigns brands have published and register your interest — our team handles the match from there."
          cta={{
            href: "/dashboard/discover-campaigns",
            label: "Discover campaigns",
          }}
        />
      ) : (
        <div className="space-y-3">
          {sponsored.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/sponsored/${e.id}`}
              className="card flex flex-wrap items-center justify-between gap-4 p-5 transition hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{e.name}</h3>
                  <StatusBadge status={e.status} />
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  {[
                    e.event_date &&
                      new Date(e.event_date).toLocaleDateString("en-GB"),
                    e.location,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No date set"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  Sponsorship ref {e.reference}
                  {e.budget_gbp != null
                    ? ` · Budget £${Number(e.budget_gbp).toLocaleString("en-GB")}`
                    : ""}
                </p>
              </div>
              <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                Open →
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function TabLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[var(--color-ink)] text-white"
          : "bg-[var(--color-mist)] text-[var(--color-ink-soft)] hover:bg-black/5"
      }`}
    >
      {label}
      <span className={active ? "ml-2 opacity-70" : "ml-2 opacity-60"}>
        {count}
      </span>
    </Link>
  );
}
