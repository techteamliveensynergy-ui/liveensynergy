import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications";
import { sendInvoice } from "@/lib/invoicing";
import type { PaymentMode } from "@/lib/payment-credentials";
import { INVOICE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import {
  formatGbp,
  isBillingComplete,
  snapshotBilling,
  type BillingFields,
} from "@/lib/billing";
import type { InvoiceLine } from "@/lib/types";

/**
 * Sends a DRAFT invoice to its brand — through Stripe when the active mode has
 * a verified key, otherwise as a bank-transfer invoice — then marks it sent,
 * freezes the billing details on it and tells the brand.
 *
 * Shared by the admin "Send invoice" button (admin session) and a brand's
 * order-form approval, which moves straight on to billing (service-role
 * client: no admin is signed in, so `asService` switches the reads that would
 * otherwise go through admin-only RPCs).
 */

export interface InvoiceContactDetails {
  whatsapp: string | null;
  bank_details: string | null;
  contact_note: string | null;
}

export async function invoiceContactDetails(
  client: SupabaseClient,
): Promise<InvoiceContactDetails> {
  const { data } = await client.rpc("invoice_contact_details");
  const row = ((data ?? []) as InvoiceContactDetails[])[0];
  return row ?? { whatsapp: null, bank_details: null, contact_note: null };
}

/**
 * The contact / bank block for invoices and invoice emails. Never empty: an
 * unresolved {{payment_details}} token would show literally in the email.
 */
export function paymentDetailsText(d: InvoiceContactDetails): string {
  const parts: string[] = [];
  if (d.bank_details) parts.push(`Bank transfer details:\n${d.bank_details}`);
  if (d.whatsapp) parts.push(`Questions? WhatsApp us on ${d.whatsapp}.`);
  if (d.contact_note) parts.push(d.contact_note);
  return parts.length ? parts.join("\n\n") : "Questions about this invoice? Just reply to this email.";
}

export function invoiceLink(id: string): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return origin
    ? `${origin}/dashboard/campaigns/invoices/${id}`
    : "your Live·En·Synergy dashboard, under Campaigns";
}

function plusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DeliverResult =
  | { ok: true; via: "stripe" | "manual"; alreadySent?: boolean }
  | { ok: false; error: string };

export async function deliverInvoice(opts: {
  client: SupabaseClient;
  invoiceId: string;
  /** Admin who pressed Send; null when the brand's approval triggered it. */
  actorId: string | null;
  asService?: boolean;
}): Promise<DeliverResult> {
  const { client, invoiceId } = opts;

  const { data: invoice } = await client
    .from("invoices")
    .select(
      "reference, status, amount_gbp, due_date, lines, stripe_invoice_id, stripe_mode, brands(id, profile_id, billing_legal_name, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_postcode, billing_country, vat_number)",
    )
    .eq("id", invoiceId)
    .maybeSingle<{
      reference: string;
      status: string;
      amount_gbp: number;
      due_date: string | null;
      lines: InvoiceLine[] | null;
      stripe_invoice_id: string | null;
      stripe_mode: PaymentMode | null;
      brands: ({ id: string; profile_id: string } & BillingFields) | null;
    }>();
  if (!invoice?.brands) return { ok: false, error: "Invoice not found." };
  if (invoice.status !== "draft") return { ok: true, via: "manual", alreadySent: true };

  // An invoice is a legal document: it goes to a named company at an address.
  if (!isBillingComplete(invoice.brands)) {
    return { ok: false, error: "The brand's billing details are incomplete." };
  }
  const billing = snapshotBilling(invoice.brands);
  const contact = await invoiceContactDetails(client);
  const details = paymentDetailsText(contact);

  const result = await sendInvoice({
    supabase: client,
    invoiceId,
    reference: invoice.reference,
    brandId: invoice.brands.id,
    billing,
    lines: invoice.lines,
    totalGbp: Number(invoice.amount_gbp),
    existingStripeInvoiceId: invoice.stripe_invoice_id,
    existingStripeMode: invoice.stripe_mode,
    dueDate: invoice.due_date,
    footer: contact.bank_details || contact.whatsapp || contact.contact_note ? details : null,
    asService: opts.asService,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const dueDate =
    (result.via === "stripe" ? result.dueDate : null) ??
    invoice.due_date ??
    plusDays(INVOICE.paymentTermsDays);

  // Conditional on still being a draft, so a double-click can't send (and
  // notify) twice; the billing details are frozen onto the invoice here.
  const { data: sent } = await client
    .from("invoices")
    .update({
      status: "sent",
      sent_at: result.sentAt,
      sent_by: opts.actorId,
      external_invoice_ref: result.externalInvoiceRef,
      billing_snapshot: billing,
      due_date: dueDate,
      ...(result.via === "stripe"
        ? {
            stripe_mode: result.mode,
            stripe_invoice_id: result.stripeInvoiceId,
            stripe_invoice_number: result.externalInvoiceRef,
            hosted_invoice_url: result.hostedInvoiceUrl,
            invoice_pdf_url: result.invoicePdfUrl,
          }
        : {}),
    })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (!sent) return { ok: true, via: result.via, alreadySent: true };

  // Stripe emails its own invoice with the pay button; ours still goes too —
  // it links to the invoice page, which carries "Pay online" when hosted.
  await notify(
    {
      eventKey: "invoice.sent",
      recipientProfileId: invoice.brands.profile_id,
      // The invoice email goes to the billing address (often an accounts team).
      toEmail: billing.email ?? undefined,
      link: `/dashboard/campaigns/invoices/${invoiceId}`,
      variables: {
        reference: invoice.reference,
        amount: formatGbp(invoice.amount_gbp),
        due_date: formatDate(dueDate),
        invoice_link: invoiceLink(invoiceId),
        payment_details: details,
      },
    },
    opts.asService ? { client } : {},
  );

  return { ok: true, via: result.via };
}
