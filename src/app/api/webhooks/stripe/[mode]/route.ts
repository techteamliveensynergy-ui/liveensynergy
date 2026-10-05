import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
  isPaymentMode,
  type PaymentMode,
} from "@/lib/payment-credentials";
import { verifyStripeSignature } from "@/lib/stripe-webhook";
import { retrieveStripeInvoice } from "@/lib/invoicing";
import { notify, notifyAdmins } from "@/lib/notifications";
import { notifyCampaignOpened } from "@/lib/campaign-payment";
import { formatGbp } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StripeEvent {
  id: string;
  type: string;
  livemode: boolean;
  created: number;
  data: { object: { id?: string; object?: string } };
}

interface OurInvoice {
  id: string;
  status: string;
  reference: string;
  amount_gbp: number;
  brands: { profile_id: string; brand_name: string } | null;
}

/** Thrown for a problem a Stripe retry can't fix: recorded, then acknowledged. */
class Unprocessable extends Error {}

/**
 * Stripe webhook — one endpoint per mode (/api/webhooks/stripe/test and
 * /live), each with its own signing secret saved on Admin → Payment settings.
 *
 * Nothing in the body is trusted beyond "something happened to invoice X":
 * the signature is checked first, then the invoice is fetched back from
 * Stripe with our own key and checked against our row (id in its metadata,
 * amount to the penny, GBP) before it is marked paid. Each event id is
 * recorded once, so a redelivery is a no-op; a failure returns 500 so Stripe
 * retries it (for up to 3 days).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mode: string }> },
) {
  const { mode } = await params;
  if (!isPaymentMode(mode)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const supabase = createServiceClient();
  const secret = await getStripeWebhookSecret(mode);
  if (!supabase || !secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  // A test event can never act on the live endpoint, or the reverse.
  if (event.livemode !== (mode === "live")) {
    return NextResponse.json({ error: "mode mismatch" }, { status: 400 });
  }

  // Record the event once. A redelivery of one already processed is acknowledged
  // and ignored; one that failed earlier is processed again.
  const objectId = event.data?.object?.id ?? null;
  const { error: insertError } = await supabase.from("payment_events").insert({
    stripe_event_id: event.id,
    mode,
    type: event.type,
    stripe_object_id: objectId,
    payload: { id: event.id, type: event.type, created: event.created, object_id: objectId },
  });
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("[stripe webhook] record failed", insertError.message);
      return NextResponse.json({ error: "store failed" }, { status: 500 });
    }
    const { data: seen } = await supabase
      .from("payment_events")
      .select("processed_at")
      .eq("stripe_event_id", event.id)
      .maybeSingle<{ processed_at: string | null }>();
    if (seen?.processed_at) return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    if (objectId) {
      if (event.type === "invoice.paid") await onInvoicePaid(supabase, mode, objectId);
      else if (event.type === "invoice.payment_failed") await onPaymentFailed(supabase, mode, objectId);
      else if (event.type === "invoice.voided") await onVoided(supabase, mode, objectId);
    }
    await supabase
      .from("payment_events")
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq("stripe_event_id", event.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const final = err instanceof Unprocessable;
    console.error("[stripe webhook]", event.type, event.id, message);
    await supabase
      .from("payment_events")
      .update({ error: message.slice(0, 500), processed_at: final ? new Date().toISOString() : null })
      .eq("stripe_event_id", event.id);
    // Unprocessable: retrying won't help, so acknowledge (the error is recorded).
    return final
      ? NextResponse.json({ ok: true, error: message })
      : NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

async function findInvoice(supabase: SupabaseClient, mode: PaymentMode, stripeInvoiceId: string) {
  const { data } = await supabase
    .from("invoices")
    .select("id, status, reference, amount_gbp, brands(profile_id, brand_name)")
    .eq("stripe_invoice_id", stripeInvoiceId)
    .eq("stripe_mode", mode)
    .maybeSingle<OurInvoice>();
  return data;
}

function invoiceLink(id: string): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return origin
    ? `${origin}/dashboard/campaigns/invoices/${id}`
    : "your Live·En·Synergy dashboard, under Campaigns";
}

function revalidateInvoice(id: string) {
  revalidatePath("/dashboard/admin/invoices");
  revalidatePath(`/dashboard/admin/invoices/${id}`);
  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/invoices/${id}`);
  revalidatePath("/dashboard/discover-campaigns");
}

async function onInvoicePaid(supabase: SupabaseClient, mode: PaymentMode, stripeInvoiceId: string) {
  const ours = await findInvoice(supabase, mode, stripeInvoiceId);
  // An invoice created by hand in the Stripe Dashboard isn't one of ours.
  if (!ours) throw new Unprocessable(`No invoice here for Stripe invoice ${stripeInvoiceId}.`);
  // Already paid here — usually an admin's "Mark paid", which told Stripe.
  if (ours.status === "paid") return;

  // Don't trust the event body: ask Stripe, with our own key.
  const key = await getStripeSecretKey(mode);
  if (!key) throw new Error(`The ${mode} Stripe key couldn't be read.`);
  const inv = await retrieveStripeInvoice(key, stripeInvoiceId);
  if (inv.status !== "paid") throw new Unprocessable(`Stripe says ${inv.id} is ${inv.status}, not paid.`);
  if (inv.currency !== "gbp") throw new Unprocessable(`Unexpected currency ${inv.currency}.`);
  if (inv.metadata?.invoice_id !== ours.id) {
    throw new Unprocessable(`Stripe invoice ${inv.id} doesn't belong to invoice ${ours.reference}.`);
  }
  if (inv.amount_paid !== Math.round(Number(ours.amount_gbp) * 100)) {
    throw new Unprocessable(
      `Paid ${(inv.amount_paid / 100).toFixed(2)} but ${ours.reference} is ${Number(ours.amount_gbp).toFixed(2)} — not marked paid; check it by hand.`,
    );
  }

  // A TEST payment must never open a campaign while the platform takes real
  // (LIVE) payments; it is still recorded as paid.
  const { data: activeMode } = await supabase.rpc("payment_active_mode");
  const openCampaign = !(mode === "test" && activeMode === "live");

  const { data, error } = await supabase.rpc("stripe_mark_invoice_paid", {
    p_stripe_invoice_id: stripeInvoiceId,
    p_mode: mode,
    p_open_campaign: openCampaign,
  });
  if (error) throw new Error(`mark paid failed: ${error.message}`);
  const result = (data ?? {}) as {
    already?: boolean;
    skipped?: string;
    opened?: boolean;
    campaign_id?: string | null;
  };
  if (result.already) return;

  const brandName = ours.brands?.brand_name ?? "A brand";
  const amount = formatGbp(Number(ours.amount_gbp));
  await notifyAdmins(
    { eventKey: "admin.invoice_paid", link: `/dashboard/admin/invoices/${ours.id}`, variables: { reference: ours.reference, brand_name: brandName, amount } },
    { client: supabase },
  );
  if (result.skipped) {
    // e.g. cancelled here but paid in Stripe before the void reached it.
    throw new Unprocessable(`Paid in Stripe, but ${ours.reference} is ${result.skipped} here — needs a refund or a re-open by hand.`);
  }

  if (ours.brands?.profile_id) {
    await notify(
      {
        eventKey: "invoice.paid",
        recipientProfileId: ours.brands.profile_id,
        link: `/dashboard/campaigns/invoices/${ours.id}`,
        variables: { reference: ours.reference, amount },
      },
      { client: supabase },
    );
  }
  if (result.opened && result.campaign_id) {
    await notifyCampaignOpened(supabase, result.campaign_id);
  }
  revalidateInvoice(ours.id);
}

async function onPaymentFailed(supabase: SupabaseClient, mode: PaymentMode, stripeInvoiceId: string) {
  const ours = await findInvoice(supabase, mode, stripeInvoiceId);
  if (!ours) return;
  if (ours.brands?.profile_id) {
    await notify(
      {
        eventKey: "invoice.payment_failed",
        recipientProfileId: ours.brands.profile_id,
        link: `/dashboard/campaigns/invoices/${ours.id}`,
        variables: { reference: ours.reference, invoice_link: invoiceLink(ours.id) },
      },
      { client: supabase },
    );
  }
  await notifyAdmins(
    {
      eventKey: "admin.invoice_payment_failed",
      link: `/dashboard/admin/invoices/${ours.id}`,
      variables: { reference: ours.reference, brand_name: ours.brands?.brand_name ?? "A brand" },
    },
    { client: supabase },
  );
}

async function onVoided(supabase: SupabaseClient, mode: PaymentMode, stripeInvoiceId: string) {
  const { data, error } = await supabase.rpc("stripe_mark_invoice_voided", {
    p_stripe_invoice_id: stripeInvoiceId,
    p_mode: mode,
  });
  if (error) throw new Error(`void failed: ${error.message}`);
  const id = (data as { invoice_id?: string | null } | null)?.invoice_id;
  if (id) revalidateInvoice(id);
}
