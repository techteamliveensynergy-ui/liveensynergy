import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { computePlatformFee } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { setCampaignStatus } from "../marketplace-actions";
import { MatchForm } from "./MatchForm";
import { formatEventDateTime } from "@/lib/event-time";

export const metadata = { title: "Campaigns · Admin" };

const STATUSES = ["in_progress", "closed", "completed"];

interface Row {
  id: string;
  reference: string;
  description: string;
  budget_gbp: number;
  category: string | null;
  preferred_location: string | null;
  preferred_timeline: string | null;
  reward_rules: string | null;
  status: string;
  created_at: string;
  matched_listing_id: string | null;
  brands: { brand_name: string; profile_id: string } | null;
}

/** A sponsored event standing against a campaign — one of possibly several. */
interface Suggestion {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  brand_agreed: boolean;
  artist_agreed: boolean;
  event_date: string | null;
}

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; matched?: string }>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: campaignRows }, { data: listingRows }, { data: suggestedRows }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("*, brands(brand_name, profile_id)")
        .order("created_at", { ascending: false }),
      supabase
        .from("event_listings")
        .select("id, name, city, event_date, start_time, timezone, budget_range")
        .eq("status", "available")
        .order("event_date", { ascending: true }),
      // Every event standing against a campaign — a campaign can carry several
      // suggestions at once, and admin needs to see which one was accepted.
      supabase
        .from("sponsored_events")
        .select(
          "id, name, status, campaign_id, brand_agreed, artist_agreed, event_date",
        )
        .not("campaign_id", "is", null)
        .order("created_at", { ascending: true }),
    ]);

  let campaigns = (campaignRows ?? []) as Row[];
  const listings = ((listingRows ?? []) as {
    id: string;
    name: string;
    city: string | null;
    event_date: string | null;
    start_time: string | null;
    timezone: string;
    budget_range: string | null;
  }[]).map((l) => ({
    id: l.id,
    label: [l.name, l.city, l.event_date ? formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone }) : null]
      .filter(Boolean)
      .join(" · "),
  }));

  const suggestions = (suggestedRows ?? []) as Suggestion[];
  const suggestionsFor = (campaignId: string) =>
    suggestions.filter((s) => s.campaign_id === campaignId);

  if (sp.status) campaigns = campaigns.filter((c) => c.status === sp.status);
  if (sp.matched === "no")
    campaigns = campaigns.filter((c) => !c.matched_listing_id);
  if (sp.matched === "yes")
    campaigns = campaigns.filter((c) => c.matched_listing_id);

  const unmatched = ((campaignRows ?? []) as Row[]).filter(
    (c) => !c.matched_listing_id,
  ).length;

  const link = (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    return `/dashboard/admin/campaigns${q.toString() ? `?${q}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle={`Sponsorship requests from brands. ${unmatched} still need matching.`}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href={link({})}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !sp.status && !sp.matched
              ? "bg-[var(--color-brand)] text-white"
              : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
          }`}
        >
          All
        </Link>
        <Link
          href={link({ matched: "no" })}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            sp.matched === "no"
              ? "bg-[var(--color-brand)] text-white"
              : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
          }`}
        >
          Needs matching ({unmatched})
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={link({ status: s })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
              sp.status === s
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {s.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No campaigns match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const fee = computePlatformFee(Number(c.budget_gbp));
            return (
              <div key={c.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[var(--color-ink)]">
                        {c.brands?.brand_name ?? "Unknown brand"}
                      </span>
                      <StatusBadge status={c.status} />
                      {c.matched_listing_id ? (
                        <span className="rounded-full bg-[var(--color-sage)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-olive-deep)]">
                          Matched
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--color-gold)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink)]">
                          Needs matching
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {c.description}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      Ref {c.reference} · £
                      {Number(c.budget_gbp).toLocaleString("en-GB")} gross · £
                      {Math.round(fee.availableForSponsorship).toLocaleString(
                        "en-GB",
                      )}{" "}
                      net
                      {c.category ? ` · ${c.category}` : ""}
                      {c.preferred_location ? ` · ${c.preferred_location}` : ""}
                      {c.preferred_timeline ? ` · ${c.preferred_timeline}` : ""}
                    </p>
                    {c.reward_rules && (
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        <span className="font-semibold">Reward:</span>{" "}
                        {c.reward_rules}
                      </p>
                    )}
                  </div>

                  <form
                    action={setCampaignStatus}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <select
                      name="status"
                      className="select w-auto py-1.5 text-sm"
                      defaultValue={c.status}
                    >
                      {STATUSES.map((s) => (
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

                {/* Which events were put forward, and which one won. Editing
                    an accepted event goes through the admin event page, where
                    the change is confirmed before it saves. */}
                {suggestionsFor(c.id).length > 0 && (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <p className="field-label">
                      Suggested events ({suggestionsFor(c.id).length})
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {suggestionsFor(c.id).map((s) => {
                        const accepted =
                          s.status === "confirmed" || s.status === "completed";
                        return (
                          <Link
                            key={s.id}
                            href={`/dashboard/admin/events/sponsored/${s.id}`}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition hover:bg-[var(--color-mist)] ${
                              accepted
                                ? "border-[var(--color-olive-deep)]/30 bg-[var(--color-sage)]/50"
                                : "border-black/10"
                            }`}
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              {accepted && (
                                <span aria-hidden className="text-[var(--color-olive-deep)]">
                                  ✓
                                </span>
                              )}
                              <span
                                className={
                                  accepted
                                    ? "font-semibold text-[var(--color-ink)]"
                                    : "text-[var(--color-ink)]"
                                }
                              >
                                {s.name}
                              </span>
                              <StatusBadge status={s.status} />
                              {accepted && (
                                <span className="text-xs font-semibold text-[var(--color-olive-deep)]">
                                  selected by the sponsor
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-[var(--color-ink-soft)]">
                              {s.event_date ? formatDate(s.event_date) : "No date"}
                              {" · "}Brand {s.brand_agreed ? "✓" : "…"} · Artist{" "}
                              {s.artist_agreed ? "✓" : "…"} · Edit →
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Still open for more suggestions until one is accepted. */}
                {c.status === "in_progress" && (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <MatchForm campaignId={c.id} listings={listings} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
