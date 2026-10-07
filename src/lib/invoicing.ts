import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { INVOICE } from "./constants";
import { countryCode } from "./countries";
import { getStripeSecretKey, type PaymentMode } from "./payment-credentials";
import { stripeRequest, StripeApiError, type StripeInvoice } from "./stripe";
import type { BillingSnapshot, InvoiceLine } from "./types";

/**
 * Invoice sending — the seam between our invoices and Stripe.
 *
 * When the ACTIVE payment mode (Admin → Payment settings) has a verified
 * Stripe key, "Send" creates the invoice in Stripe with our exact lines and
 * VAT, finalises it and has Stripe email the brand a hosted page to pay by
 * card or bank transfer (which methods show is set in the Stripe Dashboard →
 * Settings → Payment methods / Invoices). Stripe's webhook later marks it paid.
 *
 * With no verified key for the active mode, Send works as before: a
 * bank-transfer invoice our own email links to, marked paid by an admin.
 */

export interface StripeReadiness {
  mode: PaymentMode;
  ready: boolean;
}

/**
 * Which mode new invoices go to, and whether it has a verified key. Works with
 * an admin session (through the admin-checked status RPCs) or with the
 * service-role client (a brand's order-form approval sends the invoice with no
 * admin signed in — those tables have no policies, so it reads them directly).
 */
export async function stripeReadiness(
  supabase: SupabaseClient,
  opts: { asService?: boolean } = {},
): Promise<StripeReadiness | null> {
  if (opts.asService) {
    const [{ data: settings }, { data: creds }] = await Promise.all([
      supabase.from("payment_settings").select("active_mode").maybeSingle<{ active_mode: string }>(),
      supabase.from("payment_credentials").select("mode, secret_key_vault_id, verified_at"),
    ]);
    if (!settings) return null;
    const mode = (settings.active_mode === "live" ? "live" : "test") as PaymentMode;
    const row = ((creds ?? []) as { mode: string; secret_key_vault_id: string | null; verified_at: string | null }[])
      .find((c) => c.mode === mode);
    return { mode, ready: !!row?.secret_key_vault_id && !!row.verified_at };
  }
  const [settings, creds] = await Promise.all([
    supabase.rpc("payment_settings_status"),
    supabase.rpc("payment_credentials_status"),
  ]);
  if (settings.error || creds.error) return null; // migrations not applied
  const mode = ((settings.data ?? [])[0]?.active_mode ?? "test") as PaymentMode;
  const row = ((creds.data ?? []) as { mode: string; has_secret_key: boolean; verified_at: string | null }[])
    .find((c) => c.mode === mode);
  return { mode, ready: !!row?.has_secret_key && !!row.verified_at };
}

export interface SendInvoiceInput {
  supabase: SupabaseClient;
  invoiceId: string;
  reference: string;
  brandId: string;
  billing: BillingSnapshot;
  /** Null for a manual invoice with a typed amount (sent as one line). */
  lines: InvoiceLine[] | null;
  totalGbp: number;
  /** Set when an earlier attempt already created a Stripe invoice. */
  existingStripeInvoiceId: string | null;
  existingStripeMode: PaymentMode | null;
  /** YYYY-MM-DD the brand must pay by (an order form's payment date). Default: 14 days. */
  dueDate?: string | null;
  /** Printed at the foot of the Stripe invoice: WhatsApp + bank-transfer details. */
  footer?: string | null;
  /** True when `supabase` is the service-role client (no admin session). */
  asService?: boolean;
}

export type SendInvoiceResult =
  | { ok: true; via: "manual"; externalInvoiceRef: string; sentAt: string }
  | {
      ok: true;
      via: "stripe";
      mode: PaymentMode;
      externalInvoiceRef: string;
      sentAt: string;
      stripeInvoiceId: string;
      hostedInvoiceUrl: string | null;
      invoicePdfUrl: string | null;
      dueDate: string | null;
    }
  | { ok: false; error: string };

const pence = (gbp: number) => Math.round(gbp * 100);

/** Unix seconds for the end of a YYYY-MM-DD date (UK), or null if missing / not in the future. */
function futureDueDate(date: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ts = Math.floor(Date.parse(`${date}T23:00:00Z`) / 1000);
  return ts > Math.floor(Date.now() / 1000) + 3600 ? ts : null;
}

export async function sendInvoice(input: SendInvoiceInput): Promise<SendInvoiceResult> {
  const readiness = await stripeReadiness(input.supabase, { asService: input.asService });
  if (!readiness?.ready) {
    return {
      ok: true,
      via: "manual",
      externalInvoiceRef: `MANUAL-${input.reference}`,
      sentAt: new Date().toISOString(),
    };
  }

  const mode = readiness.mode;
  const key = await getStripeSecretKey(mode);
  if (!key) {
    return {
      ok: false,
      error:
        "The Stripe key couldn't be read on the server. Check SUPABASE_SERVICE_ROLE_KEY is set in Vercel, or re-save the key.",
    };
  }

  try {
    const inv = await createFinalizeAndSend({ ...input, mode, key });
    return {
      ok: true,
      via: "stripe",
      mode,
      externalInvoiceRef: inv.number ?? inv.id,
      sentAt: new Date().toISOString(),
      stripeInvoiceId: inv.id,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdfUrl: inv.invoice_pdf,
      dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString().slice(0, 10) : null,
    };
  } catch (err) {
    const message = err instanceof StripeApiError ? err.message : "Unexpected error talking to Stripe.";
    return { ok: false, error: `Stripe: ${message}` };
  }
}

async function createFinalizeAndSend(
  input: SendInvoiceInput & { mode: PaymentMode; key: string },
): Promise<StripeInvoice> {
  const { supabase, key, mode, invoiceId } = input;

  // An earlier attempt may have got part-way. Finalised already → just send.
  // Still a draft in Stripe → delete it and start clean (our lines may have
  // changed since).
  if (input.existingStripeInvoiceId && input.existingStripeMode === mode) {
    // A deleted Stripe draft reads as 404 — nothing to reuse, start clean.
    const prev = await stripeRequest<StripeInvoice>(key, "GET", `/v1/invoices/${input.existingStripeInvoiceId}`)
      .catch((err) => {
        if (err instanceof StripeApiError && err.status === 404) return null;
        throw err;
      });
    if (prev?.status === "open") {
      return stripeRequest<StripeInvoice>(key, "POST", `/v1/invoices/${prev.id}/send`);
    }
    if (prev?.status === "draft") {
      await stripeRequest(key, "DELETE", `/v1/invoices/${prev.id}`);
    } else if (prev) {
      throw new StripeApiError(`This invoice is already ${prev.status} in Stripe.`, 409);
    }
  }

  const customerId = await ensureCustomer(supabase, key, mode, input.brandId, input.billing);
  const lines: InvoiceLine[] =
    input.lines && input.lines.length
      ? input.lines
      : [
          {
            kind: "package",
            description: `Invoice ${input.reference}`,
            net_gbp: input.totalGbp,
            vat_rate: 0,
            vat_gbp: 0,
            total_gbp: input.totalGbp,
          },
        ];
  const needsVat = lines.some((l) => l.vat_rate > 0);
  const taxRateId = needsVat ? await ensureVatTaxRate(key) : null;

  // Idempotency keys make a double-clicked Send converge on ONE Stripe
  // invoice: the second request gets the same invoice and the same items back,
  // and its finalize then fails harmlessly. The key changes when an earlier
  // Stripe draft was deleted above, so a genuine retry starts fresh.
  const attempt = `${invoiceId}_${input.existingStripeInvoiceId ?? "first"}`;
  const created = await stripeRequest<StripeInvoice>(key, "POST", "/v1/invoices", {
    customer: customerId,
    collection_method: "send_invoice",
    // A payment date agreed on the order form wins; Stripe rejects a due date
    // in the past, so a stale one falls back to the standard terms.
    ...(futureDueDate(input.dueDate)
      ? { due_date: futureDueDate(input.dueDate) }
      : { days_until_due: INVOICE.paymentTermsDays }),
    ...(input.footer ? { footer: input.footer.slice(0, 5000) } : {}),
    currency: "gbp",
    auto_advance: false,
    pending_invoice_items_behavior: "exclude",
    metadata: { invoice_id: invoiceId, reference: input.reference },
    custom_fields: [{ name: "Our reference", value: input.reference }],
    description: `Live·En·Synergy invoice ${input.reference}. Please quote this reference with your payment.`,
  }, `les_invoice_${attempt}`);

  // Remember the Stripe invoice at once, so the webhook can find it and a
  // retry reuses it rather than creating a second one.
  await supabase
    .from("invoices")
    .update({ stripe_invoice_id: created.id, stripe_mode: mode })
    .eq("id", invoiceId)
    .eq("status", "draft");

  for (const [i, line] of lines.entries()) {
    await stripeRequest(key, "POST", "/v1/invoiceitems", {
      customer: customerId,
      invoice: created.id,
      currency: "gbp",
      amount: pence(line.net_gbp),
      description: line.description,
      ...(line.vat_rate > 0 && taxRateId ? { tax_rates: [taxRateId] } : {}),
    }, `les_item_${created.id}_${i}`);
  }

  const finalized = await stripeRequest<StripeInvoice>(
    key,
    "POST",
    `/v1/invoices/${created.id}/finalize`,
    { auto_advance: false },
  );

  // Our invoice is the legal record: Stripe's total must match it to the penny.
  if (finalized.total !== pence(input.totalGbp)) {
    await stripeRequest(key, "POST", `/v1/invoices/${created.id}/void`).catch(() => undefined);
    throw new StripeApiError(
      `Stripe's total (${(finalized.total / 100).toFixed(2)}) didn't match ours (${input.totalGbp.toFixed(2)}), so the Stripe invoice was voided and nothing was sent.`,
      422,
    );
  }

  return stripeRequest<StripeInvoice>(key, "POST", `/v1/invoices/${created.id}/send`);
}

/** One Stripe customer per brand per mode; refreshed with the latest billing details. */
export async function ensureCustomer(
  supabase: SupabaseClient,
  key: string,
  mode: PaymentMode,
  brandId: string,
  billing: BillingSnapshot,
): Promise<string> {
  const details = {
    name: billing.legal_name ?? undefined,
    email: billing.email ?? undefined,
    address: {
      line1: billing.address_line1 ?? undefined,
      line2: billing.address_line2 ?? undefined,
      city: billing.city ?? undefined,
      postal_code: billing.postcode ?? undefined,
      country: countryCode(billing.country) ?? undefined,
    },
    metadata: { brand_id: brandId },
  };

  const { data: existing } = await supabase
    .from("brand_stripe_customers")
    .select("stripe_customer_id")
    .eq("brand_id", brandId)
    .eq("mode", mode)
    .maybeSingle<{ stripe_customer_id: string }>();
  if (existing) {
    await stripeRequest(key, "POST", `/v1/customers/${existing.stripe_customer_id}`, details);
    return existing.stripe_customer_id;
  }

  const customer = await stripeRequest<{ id: string }>(
    key,
    "POST",
    "/v1/customers",
    details,
  );
  await supabase
    .from("brand_stripe_customers")
    .upsert({ brand_id: brandId, mode, stripe_customer_id: customer.id }, { onConflict: "brand_id,mode", ignoreDuplicates: true });
  return customer.id;
}

/** The account's "VAT 20% (exclusive)" tax rate, created once if missing. */
async function ensureVatTaxRate(key: string): Promise<string> {
  const pct = Math.round(INVOICE.vatRate * 100);
  const list = await stripeRequest<{ data: { id: string; percentage: number; inclusive: boolean; display_name: string; active: boolean }[] }>(
    key,
    "GET",
    "/v1/tax_rates",
    { active: true, limit: 100 },
  );
  const found = list.data.find(
    (r) => r.active && !r.inclusive && r.percentage === pct && r.display_name === "VAT",
  );
  if (found) return found.id;
  const created = await stripeRequest<{ id: string }>(
    key,
    "POST",
    "/v1/tax_rates",
    { display_name: "VAT", percentage: pct, inclusive: false, country: "GB", jurisdiction: "United Kingdom" },
    `les_tax_rate_vat_${pct}_exclusive`,
  );
  return created.id;
}

// --- Follow-up actions on a Stripe invoice ---------------------------------

async function keyFor(mode: PaymentMode): Promise<string> {
  const key = await getStripeSecretKey(mode);
  if (!key) {
    throw new StripeApiError(
      `The ${mode} Stripe key couldn't be read on the server (check SUPABASE_SERVICE_ROLE_KEY in Vercel).`,
      0,
    );
  }
  return key;
}

/** Cancel: void the open Stripe invoice (a Stripe draft is simply deleted). */
export async function voidStripeInvoice(mode: PaymentMode, stripeInvoiceId: string) {
  const key = await keyFor(mode);
  const inv = await stripeRequest<StripeInvoice>(key, "GET", `/v1/invoices/${stripeInvoiceId}`);
  if (inv.status === "draft") return stripeRequest(key, "DELETE", `/v1/invoices/${inv.id}`);
  if (inv.status === "open" || inv.status === "uncollectible") {
    return stripeRequest(key, "POST", `/v1/invoices/${inv.id}/void`);
  }
  if (inv.status === "paid") throw new StripeApiError("It has already been paid in Stripe.", 409);
  return null; // already void
}

/** Mark paid by hand (money arrived another way): stop Stripe chasing it. */
export async function markStripeInvoicePaidOutOfBand(mode: PaymentMode, stripeInvoiceId: string) {
  const key = await keyFor(mode);
  const inv = await stripeRequest<StripeInvoice>(key, "GET", `/v1/invoices/${stripeInvoiceId}`);
  if (inv.status === "paid") return inv;
  return stripeRequest<StripeInvoice>(key, "POST", `/v1/invoices/${inv.id}/pay`, { paid_out_of_band: true });
}

/** Resend: refresh the customer's email/address, then have Stripe email it again. */
export async function resendStripeInvoice(
  supabase: SupabaseClient,
  mode: PaymentMode,
  stripeInvoiceId: string,
  brandId: string,
  billing: BillingSnapshot,
) {
  const key = await keyFor(mode);
  await ensureCustomer(supabase, key, mode, brandId, billing);
  return stripeRequest<StripeInvoice>(key, "POST", `/v1/invoices/${stripeInvoiceId}/send`);
}

export async function retrieveStripeInvoice(key: string, stripeInvoiceId: string) {
  return stripeRequest<StripeInvoice>(key, "GET", `/v1/invoices/${stripeInvoiceId}`);
}

/**
 * Partial or full refund of a paid Stripe invoice (5 Oct: case-by-case amount
 * entered by an admin). Issued as a credit note with one custom line for the
 * amount, refunding it to the original payment — Stripe's own record of what
 * was given back and why. `idempotencyKey` makes a double-click one refund.
 */
export async function refundStripeInvoice(
  mode: PaymentMode,
  stripeInvoiceId: string,
  amountGbp: number,
  reason: string,
  idempotencyKey: string,
): Promise<{ id: string }> {
  const key = await keyFor(mode);
  const amount = pence(amountGbp);
  return stripeRequest<{ id: string }>(
    key,
    "POST",
    "/v1/credit_notes",
    {
      invoice: stripeInvoiceId,
      lines: [
        {
          type: "custom_line_item",
          description: `Refund: ${reason}`.slice(0, 500),
          quantity: 1,
          unit_amount: amount,
        },
      ],
      refund_amount: amount,
      memo: reason.slice(0, 500),
    },
    idempotencyKey,
  );
}
