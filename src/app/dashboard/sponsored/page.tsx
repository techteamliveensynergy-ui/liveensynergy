import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { SponsoredEvent } from "@/lib/types";

export const metadata = { title: "Sponsored events" };

export default async function SponsoredPage() {
  const { profile } = await requireRole(["brand", "artist", "event"]);
  const supabase = await createClient();

  // RLS returns only the sponsored events this user is a party to.
  const { data } = await supabase
    .from("sponsored_events")
    .select("*")
    .order("created_at", { ascending: false });
  const events = (data ?? []) as SponsoredEvent[];

  const isBrand = profile.role === "brand";

  return (
    <div>
      <PageHeader
        title="Sponsored events"
        subtitle="Confirmed and in-progress sponsorships linking a brand and an artist or event."
        action={
          isBrand ? (
            <Link href="/dashboard/sponsored/new" className="btn btn-primary">
              + New sponsored event
            </Link>
          ) : undefined
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon="🤝"
          title="No sponsored events yet"
          body={
            isBrand
              ? "Once you've matched with an artist or event, create a sponsored event to agree terms."
              : "When a brand proposes a sponsorship, it will appear here to review and agree."
          }
          cta={
            isBrand
              ? { href: "/dashboard/sponsored/new", label: "Create one" }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
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
                  {e.artist_display_name ? ` · with ${e.artist_display_name}` : ""}
                  {e.budget_gbp != null
                    ? ` · Budget £${Number(e.budget_gbp).toLocaleString("en-GB")}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 ${e.brand_agreed ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" : "bg-[var(--color-mint)] text-[var(--color-ink-soft)]"}`}
                >
                  Brand {e.brand_agreed ? "✓" : "…"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 ${e.artist_agreed ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" : "bg-[var(--color-mint)] text-[var(--color-ink-soft)]"}`}
                >
                  Artist {e.artist_agreed ? "✓" : "…"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
