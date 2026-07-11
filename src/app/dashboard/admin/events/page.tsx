import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import type { EventListing, SponsoredEvent } from "@/lib/types";
import { setListingStatus, setSponsoredStatus } from "../actions";

export const metadata = { title: "Events · Admin" };

const LISTING_STATUSES = ["draft", "available", "matched", "closed"];
const SPONSORED_STATUSES = ["in_progress", "confirmed", "completed"];

export default async function AdminEventsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [{ data: listingRows }, { data: sponsoredRows }, { data: partRows }] =
    await Promise.all([
      supabase
        .from("event_listings")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("sponsored_events")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("participations").select("sponsored_event_id, status"),
    ]);

  const listings = (listingRows ?? []) as EventListing[];
  const sponsored = (sponsoredRows ?? []) as SponsoredEvent[];
  const parts = (partRows ?? []) as {
    sponsored_event_id: string;
    status: string;
  }[];

  const countFor = (eventId: string) =>
    parts.filter((p) => p.sponsored_event_id === eventId).length;
  const verifiedFor = (eventId: string) =>
    parts.filter(
      (p) =>
        p.sponsored_event_id === eventId &&
        (p.status === "attendance_verified" || p.status === "reward_released"),
    ).length;

  return (
    <div className="space-y-10">
      <PageHeader
        title="Events"
        subtitle="Monitor listings and sponsored events, and override statuses."
      />

      {/* Sponsored events with monitoring */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Sponsored events ({sponsored.length})
        </h2>
        <div className="space-y-3">
          {sponsored.map((e) => (
            <div
              key={e.id}
              className="card flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{e.name}</h3>
                  <StatusBadge status={e.status} />
                </div>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  Ref {e.reference} ·{" "}
                  {countFor(e.id)} registered · {verifiedFor(e.id)} verified
                  {e.budget_gbp != null
                    ? ` · £${Number(e.budget_gbp).toLocaleString("en-GB")}`
                    : ""}
                </p>
              </div>
              <form action={setSponsoredStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={e.id} />
                <select name="status" className="select" defaultValue={e.status}>
                  {SPONSORED_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-ghost text-sm">
                  Update
                </button>
              </form>
            </div>
          ))}
          {sponsored.length === 0 && (
            <p className="text-sm text-[var(--color-ink-soft)]">
              No sponsored events yet.
            </p>
          )}
        </div>
      </section>

      {/* Event listings */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Event listings ({listings.length})
        </h2>
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
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  Ref {l.reference}
                  {l.city ? ` · ${l.city}` : ""}
                  {l.budget_range ? ` · ${l.budget_range}` : ""}
                </p>
              </div>
              <form action={setListingStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={l.id} />
                <select name="status" className="select" defaultValue={l.status}>
                  {LISTING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn btn-ghost text-sm">
                  Update
                </button>
              </form>
            </div>
          ))}
          {listings.length === 0 && (
            <p className="text-sm text-[var(--color-ink-soft)]">
              No event listings yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
