import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import type { CampaignIntakeRequest } from "@/lib/types";
import { reviewCampaignIntake } from "../../marketplace-actions";

export const metadata = { title: "Campaign requests · Admin" };

interface Row extends CampaignIntakeRequest {
  brands: { brand_name: string } | null;
}

export default async function AdminCampaignIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const status = sp.status ?? "submitted";
  const { data } = await supabase
    .from("campaign_intake_requests")
    .select("*, brands(brand_name)")
    .eq("status", status)
    .order("created_at", { ascending: true });

  const requests = (data ?? []) as Row[];
  const STATUSES = ["submitted", "in_review", "converted", "declined"];

  return (
    <div>
      <PageHeader
        title="Campaign requests"
        subtitle="Brand-submitted requests, waiting to become a real campaign."
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/dashboard/admin/campaigns/intake?status=${s}`}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
              status === s
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {s.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No requests with this status.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[var(--color-ink)]">
                      {r.brands?.brand_name ?? "Unknown brand"}
                    </span>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    {r.description}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    Ref {r.reference}
                    {r.budget_expectation_gbp
                      ? ` · Budget guidance £${Number(r.budget_expectation_gbp).toLocaleString("en-GB")}`
                      : ""}
                    {r.category ? ` · ${r.category}` : ""}
                    {r.preferred_location ? ` · ${r.preferred_location}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    Contact: {r.manager_name} · {r.manager_email} ·{" "}
                    {r.manager_phone}
                  </p>
                  {(r.suggested_event_note || r.suggested_event_url) && (
                    <p className="mt-2 rounded-lg bg-[var(--color-gold)]/40 px-3 py-2 text-xs text-[var(--color-ink)]">
                      <span className="font-semibold">Brand suggests:</span>{" "}
                      {r.suggested_event_note}
                      {r.suggested_event_url && (
                        <>
                          {" "}
                          <a
                            href={r.suggested_event_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-[var(--color-brand-dark)] underline"
                          >
                            Open link ↗
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </div>

                {r.status === "submitted" && (
                  <div className="flex flex-col items-end gap-2">
                    <form action={reviewCampaignIntake}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value="approve" />
                      <button type="submit" className="btn btn-primary text-sm">
                        Approve → create campaign
                      </button>
                    </form>
                    <form
                      action={reviewCampaignIntake}
                      className="flex items-center gap-2"
                    >
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="op" value="decline" />
                      <input
                        type="text"
                        name="decline_reason"
                        placeholder="Reason (optional)"
                        className="input w-40 py-1 text-xs"
                      />
                      <button
                        type="submit"
                        className="btn btn-ghost text-xs text-[var(--color-accent)]"
                      >
                        Decline
                      </button>
                    </form>
                  </div>
                )}

                {r.status === "converted" && r.converted_campaign_id && (
                  <Link
                    href={`/dashboard/admin/campaigns/${r.converted_campaign_id}`}
                    className="btn btn-ghost text-sm"
                  >
                    View campaign →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
