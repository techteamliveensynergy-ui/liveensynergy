import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import {
  FilterBar,
  matchesText,
} from "@/components/dashboard/FilterBar";
import { ARTIST_CATEGORIES, computePlatformFee } from "@/lib/constants";
import type { OpenCampaign } from "@/lib/types";
import { registerInterest } from "./actions";

export const metadata = { title: "Discover campaigns" };

interface Search {
  name?: string;
  location?: string;
  category?: string;
  budget?: string;
  registered?: string;
  error?: string;
}

export default async function DiscoverCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const { profile } = await requireRole(["artist", "event"]);
  const q = await searchParams;
  const supabase = await createClient();
  const hasFilters = Boolean(q.name || q.location || q.category || q.budget);

  const [{ data }, { data: interestRows }] = await Promise.all([
    supabase
      .from("open_campaigns")
      .select("*")
      .order("created_at", { ascending: false }),
    // RLS already limits this to the caller's own rows.
    supabase
      .from("campaign_interests")
      .select("campaign_id, created_at")
      .eq("profile_id", profile.id),
  ]);

  const registeredOn = new Map<string, string>();
  for (const r of (interestRows ?? []) as {
    campaign_id: string;
    created_at: string;
  }[]) {
    registeredOn.set(
      r.campaign_id,
      `Sent ${new Date(r.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}`,
    );
  }

  const minBudget = q.budget ? Number(q.budget) : null;
  const campaigns = ((data ?? []) as OpenCampaign[]).filter(
    (c) =>
      matchesText([c.brand_name, c.description], q.name) &&
      matchesText([c.preferred_location], q.location) &&
      (!q.category || c.category === q.category) &&
      (minBudget == null ||
        !Number.isFinite(minBudget) ||
        Number(c.budget_gbp) >= minBudget),
  );

  return (
    <div>
      <PageHeader
        title="Discover campaigns"
        subtitle="Sponsorship briefs from brands looking for artists and events. Register interest and our team will pick it up within 48 hours."
      />

      {q.registered === "1" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          ✓ Interest sent. The Live·En·Synergy team has been notified and will
          come back to you within 48 hours — you don&apos;t need to contact the
          brand yourself.
        </p>
      )}
      {q.registered === "already" && (
        <p className="mb-5 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          You&apos;ve already registered interest in that campaign — our team
          has it.
        </p>
      )}
      {q.error && (
        <p className="mb-5 rounded-lg bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          That didn&apos;t send. Please try again, and let us know if it keeps
          happening.
        </p>
      )}

      <FilterBar
        action="/dashboard/discover-campaigns"
        active={hasFilters}
        fields={[
          {
            name: "name",
            label: "Brand or keyword",
            type: "text",
            placeholder: "Search briefs",
            value: q.name,
          },
          {
            name: "location",
            label: "Location",
            type: "text",
            placeholder: "City or region",
            value: q.location,
          },
          {
            name: "category",
            label: "Category",
            type: "select",
            options: ARTIST_CATEGORIES,
            value: q.category,
          },
          {
            name: "budget",
            label: "Min budget (£)",
            type: "text",
            placeholder: "1000",
            value: q.budget,
          },
        ]}
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon="📣"
          title={
            hasFilters
              ? "No campaigns match those filters"
              : "No open campaigns right now"
          }
          body={
            hasFilters
              ? "Try widening your search — clear a filter or lower the minimum budget."
              : "When brands publish sponsorship briefs, they'll show up here for you to register interest."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {campaigns.map((c) => {
            const fee = computePlatformFee(Number(c.budget_gbp));
            return (
              <div key={c.id} className="card flex flex-col p-5">
                <div className="flex items-center justify-between">
                  <span className="chip">{c.category ?? "Any category"}</span>
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    Ref {c.reference}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{c.brand_name}</h3>
                <p className="mt-1 line-clamp-4 text-sm text-[var(--color-ink-soft)]">
                  {c.description}
                </p>

                {c.expected_outcomes && (
                  <div className="mt-3 rounded-xl bg-[var(--color-mist)] px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--color-brand-dark)]">
                      Expected outcomes:
                    </span>{" "}
                    <span className="text-[var(--color-ink-soft)]">
                      {c.expected_outcomes}
                    </span>
                  </div>
                )}

                {/* The sponsor already has an event in mind. Worth knowing
                    before pitching your own (10 Aug standup). */}
                {(c.suggested_event_note || c.suggested_event_url) && (
                  <div className="mt-3 rounded-xl bg-[var(--color-gold)]/40 px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--color-ink)]">
                      They&apos;ve suggested:
                    </span>{" "}
                    <span className="text-[var(--color-ink-soft)]">
                      {c.suggested_event_note}
                    </span>
                    {c.suggested_event_url && (
                      <>
                        {" "}
                        <a
                          href={c.suggested_event_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[var(--color-brand-dark)] underline"
                        >
                          Open link ↗
                        </a>
                      </>
                    )}
                  </div>
                )}

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-[var(--color-ink-soft)]">Location</dt>
                  <dd className="text-right">{c.preferred_location ?? "Flexible"}</dd>
                  <dt className="text-[var(--color-ink-soft)]">Timeline</dt>
                  <dd className="text-right">{c.preferred_timeline ?? "Flexible"}</dd>
                  <dt className="text-[var(--color-ink-soft)]">Available</dt>
                  <dd className="text-right font-semibold text-[var(--color-brand-dark)]">
                    £
                    {Math.max(0, fee.availableForSponsorship).toLocaleString(
                      "en-GB",
                      { maximumFractionDigits: 0 },
                    )}
                  </dd>
                </dl>

                {registeredOn.has(c.id) ? (
                  // Persistent confirmation — the whole point of storing the
                  // interest. Tells the artist it landed and stops them
                  // wondering whether the click did anything.
                  <div className="mt-4">
                    <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-center text-sm font-semibold text-[var(--color-olive-deep)]">
                      ✓ Interest sent
                    </p>
                    <p className="mt-2 text-center text-xs text-[var(--color-ink-soft)]">
                      {registeredOn.get(c.id)} · Our team has been notified and
                      will introduce you to {c.brand_name} if it&apos;s a match.
                    </p>
                  </div>
                ) : (
                  <form action={registerInterest} className="mt-4">
                    <input type="hidden" name="campaign_id" value={c.id} />
                    <button type="submit" className="btn btn-primary w-full">
                      Register interest
                    </button>
                    <p className="mt-2 text-center text-xs text-[var(--color-ink-soft)]">
                      Our team reviews every request and responds within 48
                      hours.
                    </p>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
