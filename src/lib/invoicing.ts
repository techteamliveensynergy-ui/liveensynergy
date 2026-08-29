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

export interface SendInvoiceInput {
  invoiceId: string;
  brandEmail: string;
  brandName: string;
  amountGbp: number;
  reference: string;
  dueDate: string | null;
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
