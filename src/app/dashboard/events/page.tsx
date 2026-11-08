import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { EventListing, SponsoredEvent } from "@/lib/types";
import { toggleListingStatus, deleteListing, archiveListing } from "./actions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { isCancelledEvent, listingDealState } from "@/lib/event-safety";
import { formatEventDateTime } from "@/lib/event-time";

export const metadata = { title: "My events" };

const LISTING_NOTICES: Record<string, string> = {
  deleted: "Event deleted.",
  archived: "Event archived — it's hidden from sponsors and kept under Archived below.",
  restored: "Event restored to your list.",
};

type Tab = "published" | "sponsored";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; notice?: string; error?: string }>;
}) {
  const { profile } = await requireRole(["artist", "event"]);
  const { tab: rawTab, notice, error: errorText } = await searchParams;
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

  const allListings = (listingData ?? []) as EventListing[];
  const sponsored = (sponsoredData ?? []) as SponsoredEvent[];
  // Which listings are in a partnership (0114: those can't be deleted or
  // unpublished; ones with history can only be archived). The artist's own
  // sponsorships, plus any other deal on their listings they can read.
  const { data: dealRows } = allListings.length
    ? await supabase
        .from("sponsored_events")
        .select("id, reference, listing_id, status")
        .in("listing_id", allListings.map((l) => l.id))
    : { data: [] };
  const deals = (dealRows ?? []) as { id: string; reference: string; listing_id: string | null; status: string }[];
  const liveDealFor = (listingId: string) =>
    deals.find((d) => d.listing_id === listingId && (d.status === "in_progress" || d.status === "confirmed"));
  const listings = allListings.filter((l) => !l.archived_at);
  const archived = allListings.filter((l) => l.archived_at);

  return (
    <div>
      <PageHeader
        title="My events"
        subtitle="Events you've listed for partnership, and the partnerships you've agreed."
        action={
          <Link href="/dashboard/events/new" className="btn btn-primary">
            + New event
          </Link>
        }
      />

      {notice && LISTING_NOTICES[notice] && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          {LISTING_NOTICES[notice]}
        </p>
      )}
      {errorText && (
        <p role="alert" className="mb-5 rounded-lg bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          {errorText}
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <TabLink
          href="/dashboard/events"
          label="My published events"
          count={listings.length}
          active={tab === "published"}
        />
        <TabLink
          href="/dashboard/events?tab=sponsored"
          label="My partnered events"
          count={sponsored.length}
          active={tab === "sponsored"}
        />
      </div>

      {tab === "published" ? (
        listings.length === 0 ? (
          <EmptyState
            icon="🎫"
            title="No events yet"
            body="List your first event and open it up for partnership."
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
                      <h3 className="font-semibold">
                        <Link href={`/dashboard/events/${l.id}/view`} className="hover:underline">
                          {l.name}
                        </Link>
                      </h3>
                      <StatusBadge status={l.status} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {[
                        l.event_date &&
                          formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone }),
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
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const state = listingDealState(l.id, deals);
                    const live = liveDealFor(l.id);
                    return (
                      <>
                        {/* A live partnership can't be unpublished (0114). */}
                        {state !== "live" && (l.status === "draft" || l.status === "available") && (
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
                        )}
                        <Link href={`/dashboard/events/${l.id}/view`} className="btn btn-ghost text-sm">
                          View
                        </Link>
                        <Link href={`/dashboard/events/${l.id}`} className="btn btn-ghost text-sm">
                          Edit
                        </Link>
                        {state === "live" && live ? (
                          <Link
                            href={`/dashboard/sponsored/${live.id}#cancellation`}
                            className="btn btn-ghost text-sm"
                            title="This event is in a partnership, so it can't be deleted or unpublished. Ask the team to cancel it."
                          >
                            In partnership {live.reference} · Request cancellation
                          </Link>
                        ) : state === "history" ? (
                          <form action={archiveListing}>
                            <input type="hidden" name="id" value={l.id} />
                            <ConfirmSubmitButton
                              label="Archive"
                              className="btn btn-ghost text-sm"
                              title={`Archive “${l.name}”?`}
                              points={[
                                "It's hidden from sponsors and from your list (you'll find it under Archived).",
                                "Its partnership history is kept — that's why it can't be deleted.",
                              ]}
                              confirmLabel="Archive it"
                              pendingLabel="Archiving…"
                            />
                          </form>
                        ) : (
                          <form action={deleteListing}>
                            <input type="hidden" name="id" value={l.id} />
                            <ConfirmSubmitButton
                              label="Delete"
                              className="btn btn-ghost text-sm text-[var(--color-accent)]"
                              title={`Delete “${l.name}”?`}
                              points={[
                                "The event is removed for good, with its details and image.",
                                "This can't be undone.",
                              ]}
                              confirmLabel="Delete it"
                              danger
                              pendingLabel="Deleting…"
                            />
                          </form>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {tab === "published" && archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--color-ink-soft)]">
            Archived ({archived.length})
          </summary>
          <div className="mt-3 space-y-2">
            {archived.map((l) => (
              <div key={l.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 opacity-80">
                <div>
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">Listing ref {l.reference}</p>
                </div>
                <form action={archiveListing}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="restore" value="1" />
                  <button type="submit" className="btn btn-ghost text-sm">Restore</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}

      {tab === "published" ? null : sponsored.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="No partnered events yet"
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
                  {isCancelledEvent(e) ? (
                    <span className="chip bg-[var(--color-pink)] text-[var(--color-accent)]">Cancelled</span>
                  ) : (
                    <StatusBadge status={e.status} />
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  {[
                    e.event_date &&
                      formatEventDateTime({ date: e.event_date, time: e.start_time, timeZone: e.timezone }),
                    e.location,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No date set"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  Partnership ref {e.reference}
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
