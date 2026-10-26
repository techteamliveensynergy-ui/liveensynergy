import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import { formatEventDateTime } from "@/lib/event-time";
import type { SponsoredEvent } from "@/lib/types";

export const metadata = { title: "Sponsor offers" };

export default async function OffersPage() {
  const { profile } = await requireRole(["artist", "event"]);
  const supabase = await createClient();

  // Brand enquiries no longer arrive here: since 26 Aug brands enquire with
  // our team, who relay to the artist in their own team thread. The list that
  // was here only ever showed the old direct brand↔artist chats (19 Oct).
  const { data: eventData } = await supabase
    .from("sponsored_events")
    .select("*")
    .eq("artist_profile_id", profile.id)
    .eq("artist_agreed", false)
    // Only proposals still being agreed — withdrawn and completed ones used
    // to show up here as "awaiting your response".
    .eq("status", "in_progress")
    .order("created_at", { ascending: false });

  const pending = (eventData ?? []) as SponsoredEvent[];

  const nothing = pending.length === 0;

  return (
    <div>
      <PageHeader
        title="Sponsor offers"
        subtitle="Sponsorship proposals awaiting your response."
      />

      {nothing ? (
        <EmptyState
          icon="✨"
          title="No offers yet"
          body="When a sponsorship is proposed for one of your events, you'll see it here. Make sure your events are published."
          cta={{ href: "/dashboard/events", label: "Manage my events" }}
        />
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Proposals to review
              </h2>
              <div className="space-y-3">
                {pending.map((e) => (
                  <Link
                    key={e.id}
                    href={`/dashboard/sponsored/${e.id}`}
                    className="card flex items-center justify-between p-5 transition hover:-translate-y-0.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{e.name}</h3>
                        <StatusBadge status={e.status} />
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                        {[
                          e.event_date &&
                            formatEventDateTime({ date: e.event_date, time: e.start_time, timeZone: e.timezone }),
                          e.location,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Date to be confirmed"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--color-brand)]">
                      Review &amp; agree →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
