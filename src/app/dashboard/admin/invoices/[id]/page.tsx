import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { InvoiceBreakdown } from "@/components/dashboard/InvoiceBreakdown";
import {
  daysOverdue,
  formatGbp,
  invoiceDisplayStatus,
  isUkCountry,
  isUnpaidStatus,
  missingBillingFields,
  type BillingFields,
} from "@/lib/billing";
import { formatDate, formatDateTime } from "@/lib/format";
import { stripeReadiness } from "@/lib/invoicing";
import type { BillingSnapshot, InvoiceKind, InvoiceLine } from "@/lib/types";
import {
  sendInvoiceAction,
  markInvoicePaid,
  cancelInvoice,
  resendInvoice,
  refundInvoice,
  draftInvoiceForCampaign,
} from "../actions";

export const metadata = { title: "Invoice · Admin" };

interface Row {
  id: string;
  campaign_id: string | null;
  resend_count: number;
  last_resent_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  stripe_mode: "test" | "live" | null;
  stripe_invoice_id: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  reference: string;
  kind: InvoiceKind;
  amount_gbp: number;
  status: string;
  external_invoice_ref: string | null;
  sent_at: string | null;
  paid_at: string | null;
  due_date: string | null;
  notes: string | null;
  lines: InvoiceLine[] | null;
  subtotal_gbp: number | null;
  vat_gbp: number | null;
  billing_snapshot: BillingSnapshot | null;
  brands: ({ id: string; brand_name: string; profile_id: string } & BillingFields) | null;
  sponsored_events: { name: string } | null;
  campaigns: { reference: string } | null;
}

function AddressBlock({ b }: { b: BillingSnapshot }) {
  const parts = [
    b.legal_name,
    b.address_line1,
    b.address_line2,
    [b.city, b.postcode].filter(Boolean).join(" "),
    b.country,
  ].filter(Boolean);
  return (
    <div className="text-sm">
      {parts.map((p, i) => (
        <div key={i}>{p}</div>
      ))}
      {b.email && <div className="mt-1 text-[var(--color-ink-soft)]">{b.email}</div>}
      {b.vat_number && (
        <div className="text-[var(--color-ink-soft)]">VAT {b.vat_number}</div>
      )}
    </div>
  );
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; resent?: string; refunded?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireRole(["admin"]);
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "*, brands(id, brand_name, profile_id, billing_legal_name, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_postcode, billing_country, vat_number), sponsored_events(name), campaigns(reference)",
    )
    .eq("id", id)
    .maybeSingle<Row>();
  if (!invoice) notFound();

  // Refunds (0055) and the campaign's order form (0054) — the invoice should
  // follow the brand's approval, so say so when it hasn't happened yet.
  const [{ data: refundRows }, { data: orderForm }] = await Promise.all([
    supabase
      .from("invoice_refunds")
      .select("amount_gbp, reason, method, created_at, profiles(full_name)")
      .eq("invoice_id", id)
      .order("created_at"),
    invoice.campaign_id
      ? supabase
          .from("campaign_order_forms")
          .select("reference, status")
          .eq("campaign_id", invoice.campaign_id)
          .maybeSingle<{ reference: string; status: string }>()
      : Promise.resolve({ data: null }),
  ]);
  const refunds = (refundRows ?? []) as unknown as {
    amount_gbp: number;
    reason: string;
    method: string;
    created_at: string;
    profiles: { full_name: string | null } | null;
  }[];
  const refundedTotal = Number((invoice as unknown as { refunded_gbp?: number }).refunded_gbp ?? 0);
  const refundable = Math.max(0, Number(invoice.amount_gbp) - refundedTotal);
  const paidSource = (invoice as unknown as { paid_source?: string | null }).paid_source ?? null;

  const missing = missingBillingFields(invoice.brands);
  const canSend = invoice.status === "draft" && missing.length === 0;
  const nonUk =
    invoice.brands?.billing_country && !isUkCountry(invoice.brands.billing_country);
  // Once sent, the invoice shows the details it was sent with, not the brand's
  // current (possibly since-edited) ones.
  const snapshot = invoice.billing_snapshot;
  const shown = invoiceDisplayStatus(invoice);
  const late = shown === "overdue" ? daysOverdue(invoice.due_date) : 0;
  const unpaid = isUnpaidStatus(invoice.status);
  // Resend goes to the brand's CURRENT billing email (they may have fixed it).
  const resendTo = invoice.brands?.billing_email ?? snapshot?.email ?? null;
  // Only drafts need to know where Send will go.
  const stripe = invoice.status === "draft" ? await stripeReadiness(supabase) : null;

  return (
    <div>
      <PageHeader
        title={`Invoice ${invoice.reference}`}
        action={
          <span className="flex items-center gap-2">
            <StatusBadge status={shown} />
            {late > 0 && (
              <span className="text-sm font-semibold text-[var(--color-accent)]">
                {late} day{late === 1 ? "" : "s"} overdue
              </span>
            )}
          </span>
        }
      />
      <Link
        href="/dashboard/admin/invoices"
        className="mb-4 inline-block text-sm text-[var(--color-brand)]"
      >
        ← Back to invoices
      </Link>

      {sp.error && (
        <p role="alert" className="mb-4 rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          {sp.error}
        </p>
      )}
      {sp.refunded && (
        <p role="status" className="mb-4 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Refund recorded and the brand has been told.
        </p>
      )}
      {invoice.status === "draft" && orderForm && orderForm.status !== "approved" && (
        <p className="mb-4 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm">
          Order form {orderForm.reference} hasn&apos;t been approved by the brand yet. This invoice is sent
          automatically when they approve it — send it by hand only if you&apos;ve agreed that with them.
        </p>
      )}
      {sp.resent && (
        <p role="status" className="mb-4 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          Invoice resent{resendTo ? ` to ${resendTo}` : ""}.
        </p>
      )}

      {invoice.status === "cancelled" && (
        <div className="mb-4 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink)]">
          <p>
            <span className="font-semibold">Cancelled</span>
            {invoice.cancelled_at ? ` ${formatDateTime(invoice.cancelled_at)}` : ""}
            {invoice.cancel_reason ? ` — ${invoice.cancel_reason}` : ""}
          </p>
          <div className="mt-2">
            {invoice.kind === "campaign_package" && invoice.campaign_id ? (
              <form action={draftInvoiceForCampaign}>
                <input type="hidden" name="campaign_id" value={invoice.campaign_id} />
                <button type="submit" className="btn btn-ghost text-sm">
                  Draft a replacement
                </button>
              </form>
            ) : (
              <Link href="/dashboard/admin/invoices/new" className="btn btn-ghost text-sm">
                Create a new invoice
              </Link>
            )}
          </div>
        </div>
      )}

      {invoice.status === "draft" && invoice.kind === "campaign_package" && (
        <p className="mb-4 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
          This draft was created automatically from the campaign. The brand
          can&apos;t see it until you send it — check the lines and totals first.
        </p>
      )}

      {invoice.status === "draft" && (
        <p className="mb-4 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink)]">
          {stripe?.ready ? (
            <>
              <span className="font-semibold">
                Sending goes through Stripe ({stripe.mode === "live" ? "LIVE — real money" : "Test mode"}).
              </span>{" "}
              Stripe emails the brand&apos;s billing address a page to pay by
              card or bank transfer, and this invoice is marked paid
              automatically when they do.
            </>
          ) : (
            <>
              <span className="font-semibold">Stripe isn&apos;t set up for the active mode</span>{" "}
              — sending issues a bank-transfer invoice you mark paid by hand.{" "}
              <Link href="/dashboard/admin/settings/payments" className="underline">
                Payment settings
              </Link>
            </>
          )}
        </p>
      )}

      {invoice.status === "draft" && missing.length > 0 && (
        <div className="mb-4 rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          <p className="font-semibold">
            Billing details incomplete — this can&apos;t be sent yet.
          </p>
          <p className="mt-1">
            Missing: {missing.join(", ")}. Ask the brand to add them in their
            profile
            {invoice.brands && (
              <>
                , or{" "}
                <Link
                  href={`/dashboard/admin/users/${invoice.brands.profile_id}`}
                  className="font-semibold underline"
                >
                  fill them in for them
                </Link>
              </>
            )}
            .
          </p>
        </div>
      )}

      {nonUk && invoice.status === "draft" && (
        <p className="mb-4 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
          This brand is based outside the UK ({invoice.brands?.billing_country}).
          The VAT treatment on this invoice needs review before it is sent.
        </p>
      )}

      <div className="card p-6">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="field-label">Brand</dt>
            <dd className="text-sm">{invoice.brands?.brand_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="field-label">Total payable</dt>
            <dd className="text-sm">{formatGbp(invoice.amount_gbp)}</dd>
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
            <dd className="text-sm">
              {invoice.due_date
                ? formatDate(invoice.due_date)
                : "Set when sent (14 days)"}
            </dd>
          </div>
          <div>
            <dt className="field-label">External reference</dt>
            <dd className="text-sm">
              {invoice.external_invoice_ref ?? "—"}
              {invoice.stripe_mode && (
                <span className="chip ml-2 text-xs">
                  Stripe · {invoice.stripe_mode === "live" ? "Live" : "Test"}
                </span>
              )}
            </dd>
          </div>
          {(invoice.hosted_invoice_url || invoice.invoice_pdf_url) && (
            <div className="sm:col-span-2">
              <dt className="field-label">Stripe</dt>
              <dd className="flex flex-wrap gap-3 text-sm">
                {invoice.hosted_invoice_url && (
                  <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] underline">
                    Payment page
                  </a>
                )}
                {invoice.invoice_pdf_url && (
                  <a href={invoice.invoice_pdf_url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-brand)] underline">
                    PDF
                  </a>
                )}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-6 border-t border-black/10 pt-4">
          <p className="field-label mb-2">Items</p>
          <InvoiceBreakdown
            lines={invoice.lines}
            subtotalGbp={invoice.subtotal_gbp != null ? Number(invoice.subtotal_gbp) : null}
            vatGbp={invoice.vat_gbp != null ? Number(invoice.vat_gbp) : null}
            totalGbp={Number(invoice.amount_gbp)}
          />
        </div>

        <div className="mt-6 border-t border-black/10 pt-4">
          <p className="field-label mb-2">
            {snapshot ? "Billed to (as sent)" : "Bill to"}
          </p>
          {snapshot ? (
            <AddressBlock b={snapshot} />
          ) : missing.length === 0 && invoice.brands ? (
            <AddressBlock
              b={{
                legal_name: invoice.brands.billing_legal_name,
                email: invoice.brands.billing_email,
                address_line1: invoice.brands.billing_address_line1,
                address_line2: invoice.brands.billing_address_line2,
                city: invoice.brands.billing_city,
                postcode: invoice.brands.billing_postcode,
                country: invoice.brands.billing_country,
                vat_number: invoice.brands.vat_number,
              }}
            />
          ) : (
            <p className="text-sm text-[var(--color-ink-soft)]">Not provided yet.</p>
          )}
        </div>

        {invoice.notes && (
          <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
            {invoice.notes}
          </p>
        )}

        {invoice.kind === "campaign_package" &&
          (invoice.status === "sent" || invoice.status === "overdue") && (
            <p className="mt-6 text-xs text-[var(--color-ink-soft)]">
              {invoice.stripe_invoice_id
                ? "Paid through Stripe, this is marked paid automatically. Use Mark paid only if the money arrived another way — Stripe is told too, so it stops reminding the brand. "
                : ""}
              Marking this paid also opens the campaign to artists (if it is
              still awaiting payment) and tells the brand.
            </p>
          )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
          {invoice.status === "draft" && (
            <form action={sendInvoiceAction}>
              <input type="hidden" name="id" value={invoice.id} />
              <button
                type="submit"
                className="btn btn-primary text-sm"
                disabled={!canSend}
                title={canSend ? undefined : "Billing details are incomplete"}
              >
                Send invoice
              </button>
            </form>
          )}
          {(invoice.status === "sent" || invoice.status === "overdue") && (
            <form action={markInvoicePaid}>
              <input type="hidden" name="id" value={invoice.id} />
              <button type="submit" className="btn btn-ghost text-sm">
                Mark paid
              </button>
            </form>
          )}
          {["draft", "sent", "overdue"].includes(invoice.status) && (
            <details className="w-full sm:w-auto">
              <summary className="btn btn-ghost cursor-pointer text-sm text-[var(--color-accent)]">
                Cancel invoice…
              </summary>
              <form action={cancelInvoice} className="mt-2 space-y-2 rounded-xl border border-black/10 p-3">
                <input type="hidden" name="id" value={invoice.id} />
                <textarea
                  name="reason"
                  rows={2}
                  className="textarea text-sm"
                  placeholder={
                    invoice.stripe_invoice_id
                      ? "Reason (optional — shown to the brand). Also voids it in Stripe."
                      : "Reason (optional — shown to the brand if they already received it)"
                  }
                />
                <button type="submit" className="btn btn-ghost text-sm text-[var(--color-accent)]">
                  Cancel this invoice
                </button>
              </form>
            </details>
          )}
        </div>

        {invoice.status === "paid" && (
          <div className="mt-4 border-t border-black/10 pt-4">
            <p className="field-label">Refunds</p>
            {refunds.length > 0 ? (
              <ul className="mb-3 space-y-1 text-sm">
                {refunds.map((r, i) => (
                  <li key={i}>
                    <span className="font-semibold">{formatGbp(r.amount_gbp)}</span> · {r.reason} ·{" "}
                    {r.method === "stripe" ? "through Stripe" : "recorded by hand"} · {formatDateTime(r.created_at)}
                    {r.profiles?.full_name ? ` · ${r.profiles.full_name}` : ""}
                  </li>
                ))}
                <li className="text-[var(--color-ink-soft)]">
                  Refunded {formatGbp(refundedTotal)} of {formatGbp(invoice.amount_gbp)}.
                </li>
              </ul>
            ) : (
              <p className="mb-3 text-sm text-[var(--color-ink-soft)]">No refunds.</p>
            )}
            {refundable > 0 && (
              <details>
                <summary className="btn btn-ghost cursor-pointer text-sm">Refund…</summary>
                <form action={refundInvoice} className="mt-2 grid gap-3 rounded-xl border border-black/10 p-4 sm:grid-cols-3">
                  <input type="hidden" name="id" value={invoice.id} />
                  <div>
                    <label className="field-label" htmlFor="amount_gbp">Amount (max {formatGbp(refundable)})</label>
                    <input id="amount_gbp" name="amount_gbp" inputMode="decimal" className="input" required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="field-label" htmlFor="reason">Reason (the brand sees this)</label>
                    <input id="reason" name="reason" className="input" required placeholder="e.g. Event postponed — 90% refund agreed" />
                  </div>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" name="manual" defaultChecked={paidSource !== "stripe"} disabled={paidSource !== "stripe"} />
                    {paidSource === "stripe"
                      ? "Already refunded outside Stripe — just record it"
                      : "Paid outside Stripe, so this records a refund made by bank transfer"}
                  </label>
                  {paidSource !== "stripe" && <input type="hidden" name="manual" value="on" />}
                  <div className="sm:text-right">
                    <button type="submit" className="btn btn-primary text-sm">Issue refund</button>
                  </div>
                </form>
              </details>
            )}
          </div>
        )}

        {unpaid && (
          <div className="mt-4 border-t border-black/10 pt-4">
            <p className="field-label">Resend to the brand</p>
            <p className="mb-2 text-sm text-[var(--color-ink-soft)]">
              {resendTo ? (
                <>
                  Will send to <span className="font-semibold text-[var(--color-ink)]">{resendTo}</span>
                  {snapshot?.email && resendTo !== snapshot.email
                    ? ` (originally sent to ${snapshot.email})`
                    : ""}
                  .
                </>
              ) : (
                "The brand has no billing email to send to."
              )}
              {invoice.resend_count > 0 && invoice.last_resent_at
                ? ` Resent ${invoice.resend_count}× — last ${formatDateTime(invoice.last_resent_at)}.`
                : ""}
            </p>
            <form action={resendInvoice}>
              <input type="hidden" name="id" value={invoice.id} />
              <button type="submit" className="btn btn-ghost text-sm" disabled={!resendTo}>
                Resend invoice
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
