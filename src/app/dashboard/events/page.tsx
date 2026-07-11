import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { EventListing } from "@/lib/types";
import { toggleListingStatus, deleteListing } from "./actions";

export const metadata = { title: "My events" };

export default async function EventsPage() {
  const { profile } = await requireRole(["artist", "event"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("event_listings")
    .select("*")
    .eq("owner_profile_id", profile.id)
    .order("created_at", { ascending: false });

  const listings = (data ?? []) as EventListing[];

  return (
    <div>
      <PageHeader
        title="My events"
        subtitle="Create events and mark them available for sponsorship."
        action={
          <Link href="/dashboard/events/new" className="btn btn-primary">
            + New event
          </Link>
        }
      />

      {listings.length === 0 ? (
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
                  Ref {l.reference}
                  {l.budget_range ? ` · ${l.budget_range}` : ""}
                </p>
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
                    className="btn btn-ghost text-sm text-red-600"
                    type="submit"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
