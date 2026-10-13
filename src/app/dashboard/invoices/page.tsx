import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, MetricTile, StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import { formatGbp, invoiceDisplayStatus, ukToday } from "@/lib/billing";
import { campaignTitle } from "@/lib/campaign-requests";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Invoices" };

type Row = Invoice & {
  refunded_gbp: number | null;
  campaigns: {
    reference: string;
    campaign_name: string | null;
    target_name: string | null;
    category: string | null;
    category_other: string | null;
  } | null;
};

/**
 * Every invoice a brand has been sent, in one place (client notes, 13 Oct:
 * "Invoices" as its own module). Each one still opens the invoice page under
 * Campaigns live, which has the pay link, PDF and bank details; this is the
 * list. Drafts never reach a brand (RLS, 0047).
 */
export default async function BrandInvoicesPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const { data } = brand
    ? await supabase
        .from("invoices")
        .select("*, campaigns(reference, campaign_name, target_name, category, category_other)")
        .eq("brand_id", brand.id)
        .neq("status", "draft")
        .order("created_at", { ascending: false })
    : { data: [] };
  const invoices = (data ?? []) as unknown as Row[];

  const today = ukToday();
  const open = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const overdue = open.filter((i) => invoiceDisplayStatus(i, today) === "overdue");
  const outstanding = open.reduce((sum, i) => sum + Number(i.amount_gbp), 0);
  const paid = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + Number(i.amount_gbp) - Number(i.refunded_gbp ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Every invoice from Live·En·Synergy — what's due, what's paid, and a copy of each."
      />

      {invoices.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No invoices yet"
          body="Once you approve a campaign's order form, its invoice appears here and under the campaign."
          cta={{ href: "/dashboard/campaigns/live", label: "See your campaigns" }}
        />
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <MetricTile
              label="To pay"
              value={formatGbp(outstanding)}
              hint={open.length === 1 ? "1 invoice" : `${open.length} invoices`}
              tint={open.length > 0 ? "bg-[var(--color-gold)]/40" : undefined}
            />
            <MetricTile
              label="Overdue"
              value={overdue.length}
              hint={overdue.length > 0 ? "past their due date" : "nothing overdue"}
              tint={overdue.length > 0 ? "bg-[var(--color-pink)]/50" : undefined}
            />
            <MetricTile label="Paid to date" value={formatGbp(paid)} hint="net of any refunds" />
          </div>

          <div className="space-y-2">
            {invoices.map((inv) => {
              const status = invoiceDisplayStatus(inv, today);
              const payable = inv.status === "sent" || inv.status === "overdue";
              const refunded = Number(inv.refunded_gbp ?? 0);
              return (
                <div
                  key={inv.id}
                  className="card flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/campaigns/invoices/${inv.id}`}
                        className="font-semibold hover:underline"
                      >
                        Invoice {inv.reference}
                      </Link>
                      <StatusBadge status={status} />
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                      {inv.campaigns ? (
                        <Link
                          href={`/dashboard/campaigns/live/${inv.campaign_id}`}
                          className="hover:underline"
                        >
                          {campaignTitle(inv.campaigns, inv.campaigns.reference)}
                        </Link>
                      ) : (
                        "Not tied to a campaign"
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                      {formatGbp(inv.amount_gbp)}
                      {inv.vat_gbp != null ? " inc. VAT" : ""}
                      {inv.sent_at ? ` · issued ${formatDate(inv.sent_at)}` : ""}
                      {inv.status === "paid" && inv.paid_at
                        ? ` · paid ${formatDate(inv.paid_at)}`
                        : inv.due_date
                          ? ` · due ${formatDate(inv.due_date)}`
                          : ""}
                      {refunded > 0 ? ` · ${formatGbp(refunded)} refunded` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {inv.invoice_pdf_url && (
                      <a
                        href={inv.invoice_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost text-sm"
                      >
                        PDF
                      </a>
                    )}
                    <Link
                      href={`/dashboard/campaigns/invoices/${inv.id}`}
                      className={payable ? "btn btn-primary text-sm" : "btn btn-ghost text-sm"}
                    >
                      {payable ? "View & pay" : "View"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
