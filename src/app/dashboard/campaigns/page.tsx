import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import type { Campaign, CampaignIntakeRequest, Invoice } from "@/lib/types";
import {
  formatGbp,
  invoiceDisplayStatus,
  isBillingComplete,
  type BillingFields,
} from "@/lib/billing";
import { withdrawCampaignIntake } from "./actions";
import { ORDER_FORM_STATUS_LABELS, type OrderFormStatus } from "@/lib/order-forms";

export const metadata = { title: "Campaigns" };

type InvoiceRow = Invoice & { campaigns: { reference: string } | null };

export default async function CampaignsPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, billing_legal_name, billing_email, billing_address_line1, billing_city, billing_postcode, billing_country",
    )
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string } & Partial<BillingFields>>();

  const [{ data: intakeData }, { data: campaignData }, { data: invoiceData }, { data: orderFormData }] = brand
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
        // Drafts are an admin's working copy — a brand only ever sees an
        // invoice once it has been sent. (RLS enforces this too, since 0047.)
        supabase
          .from("invoices")
          .select("*, campaigns(reference)")
          .eq("brand_id", brand.id)
          .neq("status", "draft")
          .order("created_at", { ascending: false }),
        // Order forms the team has sent (RLS hides drafts) — 0054.
        supabase
          .from("campaign_order_forms")
          .select("id, reference, status, campaign_name, total_gbp, sent_at, approved_at, campaigns(reference)")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const orderForms = (orderFormData ?? []) as unknown as {
    id: string;
    reference: string;
    status: OrderFormStatus;
    campaign_name: string | null;
    total_gbp: number | null;
    sent_at: string | null;
    approved_at: string | null;
    campaigns: { reference: string } | null;
  }[];

  const requests = (intakeData ?? []) as CampaignIntakeRequest[];
  const campaigns = (campaignData ?? []) as Campaign[];
  const invoices = (invoiceData ?? []) as InvoiceRow[];
  // A campaign means an invoice is coming; it can't be sent without these.
  const needsBilling =
    !!brand && campaigns.length > 0 && !isBillingComplete(brand);

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

      {orderForms.length > 0 && (
        <section className="mb-6 space-y-3">
          {orderForms.map((f) => (
            <Link
              key={f.id}
              href={`/order-forms/${f.id}`}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 ${
                f.status === "sent"
                  ? "bg-[var(--color-brand)] text-white"
                  : "card"
              }`}
            >
              <div>
                <p className="font-semibold">
                  {f.status === "sent" ? "Your order form is ready to review — " : "Order form "}
                  {f.reference}
                </p>
                <p className={`text-sm ${f.status === "sent" ? "text-white/85" : "text-[var(--color-ink-soft)]"}`}>
                  {f.campaign_name ?? "Campaign"} · {f.campaigns?.reference ?? ""}
                  {f.total_gbp != null ? ` · ${formatGbp(f.total_gbp)} incl. VAT` : ""}
                </p>
              </div>
              <span className={f.status === "sent" ? "btn btn-white text-sm" : "chip"}>
                {f.status === "sent" ? "Review & approve →" : ORDER_FORM_STATUS_LABELS[f.status]}
              </span>
            </Link>
          ))}
        </section>
      )}

      {needsBilling && (
        <div className="mb-6 rounded-2xl bg-[var(--color-gold)]/40 px-5 py-4 text-sm text-[var(--color-ink)]">
          <p className="font-semibold">Add your billing details</p>
          <p className="mt-1">
            When we invoice you we&apos;ll need your company&apos;s legal name,
            billing email and address. Adding them now means your invoice can
            go out without delay.{" "}
            <Link
              href="/dashboard/profile"
              className="font-semibold text-[var(--color-brand-dark)] underline"
            >
              Add them in your profile
            </Link>
            .
          </p>
        </div>
      )}

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
                  {c.status === "awaiting_payment" && (
                    <p className="mt-2 rounded-lg bg-[var(--color-lavender)]/50 px-3 py-2 text-xs text-[var(--color-ink)]">
                      Your campaign opens to artists once its invoice is paid.{" "}
                      {(() => {
                        const inv = invoices.find(
                          (i) =>
                            i.campaign_id === c.id &&
                            (i.status === "sent" || i.status === "overdue"),
                        );
                        return inv ? (
                          <Link
                            href={`/dashboard/campaigns/invoices/${inv.id}`}
                            className="font-semibold text-[var(--color-brand-dark)] underline"
                          >
                            View invoice {inv.reference}
                            {inv.due_date ? ` (due ${formatDate(inv.due_date)})` : ""}
                          </Link>
                        ) : (
                          "We'll send your invoice shortly."
                        );
                      })()}
                    </p>
                  )}
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
              <Link
                key={inv.id}
                href={`/dashboard/campaigns/invoices/${inv.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-[var(--color-mist)]"
              >
                <div>
                  <p className="text-sm font-semibold">{inv.reference}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {inv.campaigns?.reference ?? "—"} · {formatGbp(inv.amount_gbp)}
                    {inv.vat_gbp != null ? " inc. VAT" : ""}
                    {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}
                  </p>
                </div>
                <StatusBadge status={invoiceDisplayStatus(inv)} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
