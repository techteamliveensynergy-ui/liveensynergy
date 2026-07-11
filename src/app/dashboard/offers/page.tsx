import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { Conversation, SponsoredEvent } from "@/lib/types";

export const metadata = { title: "Sponsor offers" };

type ConvRow = Conversation & { event_listings: { name: string } | null };

export default async function OffersPage() {
  const { profile } = await requireRole(["artist", "event"]);
  const supabase = await createClient();

  const [{ data: convData }, { data: eventData }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*, event_listings(name)")
      .eq("partner_profile_id", profile.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("sponsored_events")
      .select("*")
      .eq("artist_profile_id", profile.id)
      .eq("artist_agreed", false)
      .order("created_at", { ascending: false }),
  ]);

  const enquiries = (convData ?? []) as ConvRow[];
  const pending = (eventData ?? []) as SponsoredEvent[];

  const nothing = enquiries.length === 0 && pending.length === 0;

  return (
    <div>
      <PageHeader
        title="Sponsor offers"
        subtitle="Brand enquiries and sponsorship proposals awaiting your response."
      />

      {nothing ? (
        <EmptyState
          icon="✨"
          title="No offers yet"
          body="When a brand reaches out or proposes a sponsorship, you'll see it here. Make sure your events are published."
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
                        {e.budget_gbp != null
                          ? `Budget £${Number(e.budget_gbp).toLocaleString("en-GB")}`
                          : "Budget TBC"}
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

          {enquiries.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Brand enquiries
              </h2>
              <div className="space-y-3">
                {enquiries.map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/messages?c=${c.id}`}
                    className="card flex items-center justify-between p-5 transition hover:-translate-y-0.5"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {c.event_listings?.name ?? "Sponsorship enquiry"}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                        A brand is interested — open the conversation.
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--color-brand)]">
                      Open chat →
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
