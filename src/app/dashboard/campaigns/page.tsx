import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import { requestCategoryLabel } from "@/lib/campaign-requests";
import type { CampaignIntakeRequest } from "@/lib/types";
import { withdrawCampaignIntake } from "./actions";

export const metadata = { title: "Campaign requests" };

/**
 * What a brand has asked for (13 Oct client notes split the old single
 * Campaigns page in two). Requests live here at every status; once the team
 * turns one into a campaign it is followed under Campaigns live
 * (./live/page.tsx), along with order forms and invoices.
 */
export default async function CampaignRequestsPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase.from("brands").select("id").eq("profile_id", profile.id).maybeSingle();

  const [{ data: intakeData }, { count: liveCount }, { count: orderFormsToReview }] = brand
    ? await Promise.all([
        supabase
          .from("campaign_intake_requests")
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
        supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("brand_id", brand.id),
        supabase
          .from("campaign_order_forms")
          .select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id)
          .eq("status", "sent"),
      ])
    : [{ data: [] }, { count: 0 }, { count: 0 }];
  const requests = (intakeData ?? []) as CampaignIntakeRequest[];

  return (
    <div>
      <PageHeader
        title="Campaign requests"
        subtitle="Tell us what you're after — our team puts together a package and matches you with a fitting artist or event."
        action={
          <Link href="/dashboard/campaigns/new" className="btn btn-primary">
            + New request
          </Link>
        }
      />

      {/* An order form waiting on the brand is the one thing here that
          blocks progress, so it's surfaced on both pages. */}
      {(orderFormsToReview ?? 0) > 0 ? (
        <Link
          href="/dashboard/campaigns/live"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-brand)] px-5 py-4 text-white"
        >
          <span className="font-semibold">
            {orderFormsToReview === 1 ? "An order form is" : `${orderFormsToReview} order forms are`} ready for you
            to review
          </span>
          <span className="btn btn-white text-sm">Go to Campaigns live →</span>
        </Link>
      ) : (liveCount ?? 0) > 0 ? (
        <p className="mb-6 rounded-2xl bg-[var(--color-mist)] px-5 py-3 text-sm text-[var(--color-ink-soft)]">
          Requests our team has turned into campaigns are followed under{" "}
          <Link href="/dashboard/campaigns/live" className="font-semibold text-[var(--color-brand-dark)] underline">
            Campaigns live
          </Link>{" "}
          — with order forms, invoices and progress.
        </p>
      ) : null}

      {requests.length === 0 ? (
        <EmptyState
          icon="📣"
          title="No requests yet"
          body="Tell us your objective and budget guidance, and our team will follow up within 3 days."
          cta={{ href: "/dashboard/campaigns/new", label: "Submit a request" }}
        />
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="max-w-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/dashboard/campaigns/requests/${r.id}`} className="font-semibold hover:underline">
                    {r.target_name || requestCategoryLabel(r) || "Campaign request"}
                  </Link>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-soft)]">{r.description}</p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  Ref {r.reference} · Submitted {formatDate(r.created_at)}
                  {r.budget_expectation_gbp
                    ? ` · Budget guidance £${Number(r.budget_expectation_gbp).toLocaleString("en-GB")}`
                    : ""}
                </p>
                {r.status === "declined" && r.decline_reason && (
                  <p className="mt-2 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-xs text-[var(--color-accent)]">
                    {r.decline_reason}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/campaigns/requests/${r.id}`} className="btn btn-ghost text-sm">
                  View
                </Link>
                {r.status === "converted" && r.converted_campaign_id && (
                  <Link
                    href={`/dashboard/campaigns/live/${r.converted_campaign_id}`}
                    className="btn btn-ghost text-sm"
                  >
                    Live campaign →
                  </Link>
                )}
                {r.status === "submitted" && (
                  <>
                    <Link href={`/dashboard/campaigns/${r.id}`} className="btn btn-ghost text-sm">
                      Edit
                    </Link>
                    <form action={withdrawCampaignIntake}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="btn btn-ghost text-sm text-[var(--color-accent)]">
                        Withdraw
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
