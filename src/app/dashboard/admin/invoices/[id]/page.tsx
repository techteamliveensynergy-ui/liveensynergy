import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { sendInvoiceAction, markInvoicePaid, cancelInvoice } from "../actions";

export const metadata = { title: "Invoice · Admin" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, brands(brand_name), sponsored_events(name), campaigns(reference)")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      reference: string;
      amount_gbp: number;
      status: string;
      external_invoice_ref: string | null;
      sent_at: string | null;
      paid_at: string | null;
      due_date: string | null;
      notes: string | null;
      brands: { brand_name: string } | null;
      sponsored_events: { name: string } | null;
      campaigns: { reference: string } | null;
    }>();
  if (!invoice) notFound();

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.reference}`}
        action={<StatusBadge status={invoice.status} />}
      />
      <Link
        href="/dashboard/admin/invoices"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to invoices
      </Link>

      <div className="card p-6">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="field-label">Brand</dt>
            <dd className="text-sm">{invoice.brands?.brand_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="field-label">Amount</dt>
            <dd className="text-sm">£{Number(invoice.amount_gbp).toLocaleString("en-GB")}</dd>
          </div>
          <div>
            <dt className="field-label">Sponsored event</dt>
            <dd className="text-sm">{invoice.sponsored_events?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="field-label">Campaign</dt>
            <dd className="text-sm">{invoice.campaigns?.reference ?? "—"}</dd>
          </div>
          <div>
            <dt className="field-label">Due date</dt>
            <dd className="text-sm">{invoice.due_date ?? "—"}</dd>
          </div>
          <div>
            <dt className="field-label">External reference</dt>
            <dd className="text-sm">{invoice.external_invoice_ref ?? "—"}</dd>
          </div>
        </dl>
        {invoice.notes && (
          <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
            {invoice.notes}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
          {invoice.status === "draft" && (
            <form action={sendInvoiceAction}>
              <input type="hidden" name="id" value={invoice.id} />
              <button type="submit" className="btn btn-primary text-sm">
                Send invoice
              </button>
            </form>
          )}
          {invoice.status === "sent" && (
            <form action={markInvoicePaid}>
              <input type="hidden" name="id" value={invoice.id} />
              <button type="submit" className="btn btn-ghost text-sm">
                Mark paid
              </button>
            </form>
          )}
          {invoice.status !== "paid" && invoice.status !== "cancelled" && (
            <form action={cancelInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <button
                type="submit"
                className="btn btn-ghost text-sm text-[var(--color-accent)]"
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
