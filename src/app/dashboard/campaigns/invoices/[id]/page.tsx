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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ approved?: string }>;
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
  const sp = (await searchParams) ?? {};

  const [{ data: contactRows }, { data: refundRows }] = await Promise.all([
    supabase.rpc("invoice_contact_details"),
    supabase.from("invoice_refunds").select("amount_gbp, reason, created_at").eq("invoice_id", id).order("created_at"),
  ]);
  const contact = ((contactRows ?? []) as { whatsapp: string | null; bank_details: string | null; contact_note: string | null }[])[0];
  const refunds = (refundRows ?? []) as { amount_gbp: number; reason: string; created_at: string }[];

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

      {sp.approved && (
        <p role="status" className="mb-4 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Thank you for approving your order form. Here&apos;s your invoice — your campaign goes live as soon as it&apos;s paid.
        </p>
      )}

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
            {invoice.hosted_invoice_url && (
              <>
                {" "}
                <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                  View receipt
                </a>
              </>
            )}
          </p>
        ) : (
          <div className="mt-6 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
            {daysOverdue(invoice.due_date) > 0 && (
              <span className="mb-1 block font-semibold text-[var(--color-accent)]">
                This invoice is {daysOverdue(invoice.due_date)} day
                {daysOverdue(invoice.due_date) === 1 ? "" : "s"} overdue.
              </span>
            )}
            {invoice.hosted_invoice_url ? (
              // Stripe's hosted page: card or bank transfer, with the bank
              // details and a receipt. Marked paid here automatically.
              <>
                <p>
                  Pay {formatGbp(invoice.amount_gbp)} online by card or bank
                  transfer. This invoice updates automatically once your
                  payment arrives.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={invoice.hosted_invoice_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary text-sm"
                  >
                    Pay online
                  </a>
                  {invoice.invoice_pdf_url && (
                    <a
                      href={invoice.invoice_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost text-sm"
                    >
                      Download PDF
                    </a>
                  )}
                </div>
              </>
            ) : (
              <p>
                Please pay {formatGbp(invoice.amount_gbp)} by bank transfer, quoting{" "}
                <span className="font-semibold text-[var(--color-ink)]">
                  {invoice.reference}
                </span>{" "}
                as the payment reference.
                {contact?.bank_details ? null : (
                  <>
                    {" "}For our bank details,{" "}
                    <Link
                      href="/dashboard/messages?tab=support"
                      className="font-semibold text-[var(--color-brand-dark)] underline"
                    >
                      contact support
                    </Link>
                    .
                  </>
                )}
              </p>
            )}
          </div>
        )}
        {(contact?.bank_details || contact?.whatsapp || contact?.contact_note) && invoice.status !== "cancelled" && (
          <div className="mt-6 grid gap-4 border-t border-black/10 pt-4 text-sm sm:grid-cols-2">
            {contact.bank_details && (
              <div>
                <p className="field-label">Bank transfer details</p>
                <p className="whitespace-pre-line">{contact.bank_details}</p>
                <p className="mt-1 text-[var(--color-ink-soft)]">Quote {invoice.reference} as the reference.</p>
              </div>
            )}
            {(contact.whatsapp || contact.contact_note) && (
              <div>
                <p className="field-label">Questions about this invoice?</p>
                {contact.whatsapp && (
                  <p>
                    WhatsApp:{" "}
                    <a
                      href={`https://wa.me/${contact.whatsapp.replace(/[^\d]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline"
                    >
                      {contact.whatsapp}
                    </a>
                  </p>
                )}
                {contact.contact_note && <p className="mt-1">{contact.contact_note}</p>}
              </div>
            )}
          </div>
        )}

        {refunds.length > 0 && (
          <div className="mt-6 border-t border-black/10 pt-4 text-sm">
            <p className="field-label">Refunds</p>
            <ul className="space-y-1">
              {refunds.map((r, i) => (
                <li key={i}>
                  {formatGbp(r.amount_gbp)} refunded on {formatDate(r.created_at)} — {r.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
