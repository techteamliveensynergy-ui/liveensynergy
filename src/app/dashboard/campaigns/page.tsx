import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { Campaign, CampaignIntakeRequest, Invoice } from "@/lib/types";
import { withdrawCampaignIntake } from "./actions";

export const metadata = { title: "Campaigns" };

type InvoiceRow = Invoice & { campaigns: { reference: string } | null };

export default async function CampaignsPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const [{ data: intakeData }, { data: campaignData }, { data: invoiceData }] = brand
    ? await Promise.all([
        supabase
          .from("campaign_intake_requests")
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("campaigns")
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("invoices")
          .select("*, campaigns(reference)")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const requests = (intakeData ?? []) as CampaignIntakeRequest[];
  const campaigns = (campaignData ?? []) as Campaign[];
  const invoices = (invoiceData ?? []) as InvoiceRow[];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Tell us what you're after — our team puts together a package and matches you with a fitting artist or event."
        action={
          <Link href="/dashboard/campaigns/new" className="btn btn-primary">
            + New request
          </Link>
        }
      />

      <h2 className="mb-3 font-display text-lg font-semibold">
        Your requests
      </h2>
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
            <div
              key={r.id}
              className="card flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">
                    {r.target_name || r.category || "Campaign request"}
                  </h3>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
                  {r.description}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  Ref {r.reference}
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
              {r.status === "submitted" && (
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/campaigns/${r.id}`}
                    className="btn btn-ghost text-sm"
                  >
                    Edit
                  </Link>
                  <form action={withdrawCampaignIntake}>
                    <input type="hidden" name="id" value={r.id} />
                    <button
                      type="submit"
                      className="btn btn-ghost text-sm text-[var(--color-accent)]"
                    >
                      Withdraw
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {campaigns.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-lg font-semibold">
            Your campaigns
          </h2>
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="card flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="max-w-xl">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      {c.target_name || c.category || "Sponsorship campaign"}
                    </h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
                    {c.description}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    Ref {c.reference} · Budget £
                    {Number(c.budget_gbp).toLocaleString("en-GB")}
                  </p>
                </div>
                {/* Real campaigns are admin-managed from here — a brand
                    reaches the team rather than editing it directly. */}
                <Link
                  href="/dashboard/messages?tab=support"
                  className="btn btn-ghost text-sm"
                >
                  Contact Live·En·Synergy
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {invoices.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-lg font-semibold">
            Your orders
          </h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Payment is by bank transfer against the invoice reference below —
            no card details are collected on the platform.
          </p>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="card flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-sm font-semibold">{inv.reference}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {inv.campaigns?.reference ?? "—"} · £
                    {Number(inv.amount_gbp).toLocaleString("en-GB")}
                    {inv.due_date ? ` · due ${inv.due_date}` : ""}
                  </p>
                </div>
                <StatusBadge status={inv.status} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
