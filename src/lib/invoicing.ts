/**
 * Invoice sending — the seam between the app and whatever external
 * invoicing vendor eventually sends the actual email/PDF to the brand.
 *
 * TODO(invoicing-vendor): before wiring this up for real, consult the
 * `vercel:marketplace` skill to select/provision an invoicing integration —
 * don't hardcode a vendor choice here. Every caller only depends on this
 * function's signature, so swapping the body is the only change needed.
 * Money still moves by bank transfer (docs/payments-kyc-strategy.md) — this
 * sends the invoice, it never collects a payment itself.
 */

import type { BillingSnapshot, InvoiceLine } from "./types";

export interface SendInvoiceInput {
  invoiceId: string;
  /** The brand's billing email (required for an invoice to be sent). */
  brandEmail: string;
  /** Legal company name from the billing snapshot. */
  brandName: string;
  /** Gross total, including VAT. */
  amountGbp: number;
  reference: string;
  dueDate: string | null;
  billing: BillingSnapshot;
  /** Null for a manual invoice with a typed amount. */
  lines: InvoiceLine[] | null;
  subtotalGbp: number | null;
  vatGbp: number | null;
}

export interface SendInvoiceResult {
  externalInvoiceRef: string;
  sentAt: string;
}

export async function sendInvoice(
  input: SendInvoiceInput,
): Promise<{ ok: true; result: SendInvoiceResult } | { ok: false; error: string }> {
  return {
    ok: true,
    result: {
      externalInvoiceRef: `STUB-${input.reference}`,
      sentAt: new Date().toISOString(),
    },
  };
}
