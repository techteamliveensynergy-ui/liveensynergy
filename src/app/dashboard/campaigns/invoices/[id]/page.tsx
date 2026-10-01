import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { InvoiceBreakdown } from "@/components/dashboard/InvoiceBreakdown";
import { daysOverdue, formatGbp, invoiceDisplayStatus } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Invoice" };

type Row = Invoice & { campaigns: { reference: string } | null };

/**
 * A brand's read-only view of an invoice that has been sent to them.
 * Drafts never appear (neq below, and the 0047 RLS policy): a draft is an
 * admin's unreviewed working copy. Ownership is checked in the query itself —
 * the brand's own id — with RLS as the backstop.
 */
export default async function BrandInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string }>();
  if (!brand) notFound();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, campaigns(reference)")
    .eq("id", id)
    .eq("brand_id", brand.id)
    .neq("status", "draft")
    .maybeSingle<Row>();
  if (!invoice) notFound();

  const b = invoice.billing_snapshot;
  const addressLines = b
    ? [
        b.legal_name,
        b.address_line1,
        b.address_line2,
        [b.city, b.postcode].filter(Boolean).join(" "),
        b.country,
      ].filter(Boolean)
    : [];

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.reference}`}
        action={<StatusBadge status={invoiceDisplayStatus(invoice)} />}
      />
      <Link
        href="/dashboard/campaigns"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to campaigns
      </Link>

      <div className="card p-6">
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="field-label">Issued</dt>
            <dd className="text-sm">{formatDate(invoice.sent_at)}</dd>
          </div>
          <div>
            <dt className="field-label">Due</dt>
            <dd className="text-sm">
              {invoice.due_date ? formatDate(invoice.due_date) : "—"}
            </dd>
          </div>
          <div>
            <dt className="field-label">Campaign</dt>
            <dd className="text-sm">{invoice.campaigns?.reference ?? "—"}</dd>
          </div>
        </dl>

        {b && (
          <div className="mt-6 border-t border-black/10 pt-4">
            <p className="field-label mb-2">Billed to</p>
            <div className="text-sm">
              {addressLines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
              {b.vat_number && (
                <div className="text-[var(--color-ink-soft)]">VAT {b.vat_number}</div>
              )}
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-black/10 pt-4">
          <InvoiceBreakdown
            lines={invoice.lines}
            subtotalGbp={invoice.subtotal_gbp != null ? Number(invoice.subtotal_gbp) : null}
            vatGbp={invoice.vat_gbp != null ? Number(invoice.vat_gbp) : null}
            totalGbp={Number(invoice.amount_gbp)}
          />
        </div>

        {invoice.status === "cancelled" ? (
          <p className="mt-6 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
            This invoice was cancelled
            {invoice.cancelled_at ? ` on ${formatDate(invoice.cancelled_at)}` : ""}, so
            there is nothing to pay against it.
            {invoice.cancel_reason ? ` Reason: ${invoice.cancel_reason}` : ""}
          </p>
        ) : invoice.status === "paid" ? (
          <p className="mt-6 rounded-xl bg-[var(--color-sage)]/50 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
            Paid{invoice.paid_at ? ` on ${formatDate(invoice.paid_at)}` : ""} —
            thank you.
          </p>
        ) : (
          <p className="mt-6 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
            {daysOverdue(invoice.due_date) > 0 && (
              <span className="mb-1 block font-semibold text-[var(--color-accent)]">
                This invoice is {daysOverdue(invoice.due_date)} day
                {daysOverdue(invoice.due_date) === 1 ? "" : "s"} overdue.
              </span>
            )}
            Please pay {formatGbp(invoice.amount_gbp)} by bank transfer, quoting{" "}
            <span className="font-semibold text-[var(--color-ink)]">
              {invoice.reference}
            </span>{" "}
            as the payment reference. For our bank details,{" "}
            <Link
              href="/dashboard/messages?tab=support"
              className="font-semibold text-[var(--color-brand-dark)] underline"
            >
              contact support
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
