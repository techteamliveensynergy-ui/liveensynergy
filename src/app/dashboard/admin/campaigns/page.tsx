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

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; matched?: string }>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: campaignRows }, { data: listingRows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, brands(brand_name, profile_id)")
      .order("created_at", { ascending: false }),
    supabase
      .from("event_listings")
      .select("id, name, city, event_date, start_time, timezone, budget_range")
      .eq("status", "available")
      .order("event_date", { ascending: true }),
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

                {!c.matched_listing_id && (
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
