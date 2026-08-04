import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import { netSponsorshipBudget } from "@/lib/constants";
import type { SponsoredEvent } from "@/lib/types";
import { formatEventDateTime } from "@/lib/event-time";

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

  // Split by status rather than showing one undifferentiated list — a live deal
  // and one still being negotiated need completely different attention, and
  // confirmed is the set people come to this tab looking for.
  const confirmed = events.filter((e) => e.status === "confirmed");
  const inProgress = events.filter((e) => e.status === "in_progress");
  const completed = events.filter((e) => e.status === "completed");

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
        <div className="space-y-8">
          {/* Always rendered, even when empty — this is the section people are
              looking for, and its absence would read as a missing feature. */}
          <Section
            title="Confirmed sponsorships"
            description="Both sides have agreed terms. These are live — audience sign-ups and reward releases run against them."
            count={confirmed.length}
            emptyNote={
              isBrand
                ? "Nothing confirmed yet — once you and the artist both agree terms, the deal moves here."
                : "Nothing confirmed yet — once you and the brand both agree terms, the deal moves here."
            }
            events={confirmed}
          />

          {inProgress.length > 0 && (
            <Section
              title="Awaiting agreement"
              description="Terms are still open and editable until both parties have agreed."
              count={inProgress.length}
              events={inProgress}
            />
          )}

          {completed.length > 0 && (
            <Section
              title="Completed"
              description="Wrapped up and kept for your records."
              count={completed.length}
              events={completed}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  count,
  events,
  emptyNote,
}: {
  title: string;
  description: string;
  count: number;
  events: SponsoredEvent[];
  /** Shown instead of the list when the section is empty. */
  emptyNote?: string;
}) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          {title}{" "}
          <span className="text-sm font-normal text-[var(--color-ink-soft)]">
            ({count})
          </span>
        </h2>
        <p className="text-xs text-[var(--color-ink-soft)]">{description}</p>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
          {emptyNote}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <SponsoredCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </section>
  );
}

function SponsoredCard({ event: e }: { event: SponsoredEvent }) {
  return (
    <Link
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
            formatEventDateTime({ date: e.event_date, time: e.start_time, timeZone: e.timezone }),
            e.location,
          ]
            .filter(Boolean)
            .join(" · ") || "No date set"}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
          Sponsorship ref {e.reference}
          {e.artist_display_name ? ` · with ${e.artist_display_name}` : ""}
          {/* The net figure, not the gross budget — the service fee comes off
              before anything can be paid out. */}
          {netSponsorshipBudget(e.budget_gbp) != null
            ? ` · £${netSponsorshipBudget(e.budget_gbp)!.toLocaleString("en-GB")} for rewards`
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
  );
}
