import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { EventListing, SponsoredEvent } from "@/lib/types";
import { contactOrganiser, registerForEvent } from "./actions";

export const metadata = { title: "Discover events" };

export default async function DiscoverPage() {
  const { profile } = await requireRole(["brand", "audience"]);
  const supabase = await createClient();

  if (profile.role === "brand") {
    const { data } = await supabase
      .from("event_listings")
      .select("*")
      .eq("status", "available")
      .order("event_date", { ascending: true });
    const listings = (data ?? []) as EventListing[];

    return (
      <div>
        <PageHeader
          title="Discover events"
          subtitle="Events currently open for sponsorship. Reach out to start a conversation."
        />
        {listings.length === 0 ? (
          <EmptyState
            icon="🔎"
            title="No events available yet"
            body="Check back soon — artists and organisers are listing events open for sponsorship."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {listings.map((l) => (
              <div key={l.id} className="card flex flex-col p-5">
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
                <form action={contactOrganiser} className="mt-4">
                  <input type="hidden" name="listing_id" value={l.id} />
                  <button type="submit" className="btn btn-primary w-full">
                    Contact organiser
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Audience — sponsored events open for participation.
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("sponsored_events")
    .select("*")
    .eq("status", "confirmed")
    .or(`participation_deadline.is.null,participation_deadline.gte.${today}`)
    .order("event_date", { ascending: true });
  const events = (data ?? []) as SponsoredEvent[];

  return (
    <div>
      <PageHeader
        title="Discover events"
        subtitle="Register for events with sponsor-funded rewards — attend, get verified, get rewarded."
      />
      {events.length === 0 ? (
        <EmptyState
          icon="🎟️"
          title="No events open right now"
          body="Sponsored events with rewards will appear here once they go live."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <div key={e.id} className="card flex flex-col p-5">
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
              <form action={registerForEvent} className="mt-4">
                <input type="hidden" name="sponsored_event_id" value={e.id} />
                <button type="submit" className="btn btn-primary w-full">
                  Register to attend
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
