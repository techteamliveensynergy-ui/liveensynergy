"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";
import {
  markStripeInvoicePaidOutOfBand,
  refundStripeInvoice,
  resendStripeInvoice,
  voidStripeInvoice,
} from "@/lib/invoicing";
import { StripeApiError } from "@/lib/stripe";
import type { PaymentMode } from "@/lib/payment-credentials";
import { INVOICE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { draftCampaignInvoice } from "@/lib/billing-server";
import {
  deliverInvoice,
  invoiceContactDetails,
  invoiceLink,
  paymentDetailsText,
} from "@/lib/invoice-delivery";
import { notifyCampaignOpened } from "@/lib/campaign-payment";
import {
  formatGbp,
  isBillingComplete,
  isUnpaidStatus,
  snapshotBilling,
  type BillingFields,
} from "@/lib/billing";
import type { BillingSnapshot, InvoiceLine } from "@/lib/types";

export interface InvoiceState {
  error?: string;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function createInvoice(
  _prev: InvoiceState,
  formData: FormData,
): Promise<InvoiceState> {
  const { supabase } = await requireAdmin();
  const brandId = str(formData.get("brand_id"));
  const amount = num(formData.get("amount_gbp"));
  if (!brandId || amount == null) {
    return { error: "Brand and amount are required." };
  }

  const { data: created, error } = await supabase
    .from("invoices")
    .insert({
      brand_id: brandId,
      sponsored_event_id: str(formData.get("sponsored_event_id")),
      campaign_id: str(formData.get("campaign_id")),
      amount_gbp: amount,
      due_date: str(formData.get("due_date")),
      notes: str(formData.get("notes")),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/dashboard/admin/invoices");
  redirect(`/dashboard/admin/invoices/${created.id}`);
}

/** Routes an invoice change touches — brands see these too (L6: revalidate what was mutated). */
function revalidateInvoiceViews(id: string) {
  revalidatePath("/dashboard/admin/invoices");
  revalidatePath(`/dashboard/admin/invoices/${id}`);
  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/invoices/${id}`);
}

/** Back to the invoice's admin page with a message in the red banner. */
function failTo(id: string, message: string): never {
  revalidateInvoiceViews(id);
  redirect(`/dashboard/admin/invoices/${id}?error=${encodeURIComponent(message.slice(0, 300))}`);
}

function stripeMessage(err: unknown): string {
  return err instanceof StripeApiError ? `Stripe: ${err.message}` : "Couldn't reach Stripe — nothing was changed.";
}

export async function sendInvoiceAction(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  // Stripe when the active mode has a verified key; otherwise a bank-transfer
  // invoice as before. A failure comes back to the page in the red banner.
  const result = await deliverInvoice({ client: supabase, invoiceId: id, actorId: userId });
  if (!result.ok) failTo(id, result.error);
  revalidateInvoiceViews(id);
}

/**
 * Drafts (or re-drafts after a cancel) a campaign's package invoice. Also the
 * repair path when drafting failed at campaign creation. Idempotent.
 */
export async function draftInvoiceForCampaign(formData: FormData) {
  const { supabase } = await requireAdmin();
  const campaignId = str(formData.get("campaign_id"));
  if (!campaignId) return;

  const drafted = await draftCampaignInvoice(supabase, campaignId);
  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/admin/invoices");

  if (!drafted.ok) {
    redirect(
      `/dashboard/admin/campaigns?invoice_error=${encodeURIComponent(drafted.error.slice(0, 200))}`,
    );
  }
  if (drafted.invoiceId) redirect(`/dashboard/admin/invoices/${drafted.invoiceId}`);
  redirect("/dashboard/admin/campaigns");
}

export async function markInvoicePaid(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  // Paid some other way (e.g. a bank transfer straight to us): tell Stripe
  // first, so it stops sending the brand reminders for it.
  const { data: stripeRef } = await supabase
    .from("invoices")
    .select("stripe_invoice_id, stripe_mode")
    .eq("id", id)
    .maybeSingle<{ stripe_invoice_id: string | null; stripe_mode: PaymentMode | null }>();
  if (stripeRef?.stripe_invoice_id && stripeRef.stripe_mode) {
    try {
      await markStripeInvoicePaidOutOfBand(stripeRef.stripe_mode, stripeRef.stripe_invoice_id);
    } catch (err) {
      failTo(id, stripeMessage(err));
    }
  }

  // One atomic database call: marks the invoice paid AND, for a campaign's
  // package invoice, opens the campaign — so "paid but still hidden" can't
  // happen. It refuses anything that isn't sent or overdue.
  const { data: result, error } = await supabase.rpc("mark_invoice_paid", {
    p_invoice_id: id,
  });
  if (error) {
    console.error("[invoice] mark paid failed", id, error.message);
    revalidateInvoiceViews(id);
    return;
  }
  const { opened, campaign_id: campaignId } = (result ?? {}) as {
    opened?: boolean;
    campaign_id?: string | null;
  };

  const { data: updated } = await supabase
    .from("invoices")
    .select("reference, amount_gbp, brands(profile_id)")
    .eq("id", id)
    .maybeSingle<{
      reference: string;
      amount_gbp: number;
      brands: { profile_id: string } | null;
    }>();

  if (updated?.brands?.profile_id) {
    await notify({
      eventKey: "invoice.paid",
      recipientProfileId: updated.brands.profile_id,
      link: "/dashboard/campaigns",
      variables: {
        reference: updated.reference,
        amount: formatGbp(updated.amount_gbp),
      },
    });
  }
  if (opened && campaignId) {
    await notifyCampaignOpened(supabase, campaignId);
    // The campaign just appeared in artists' "Discover campaigns".
    revalidatePath("/dashboard/discover-campaigns");
  }

  revalidateInvoiceViews(id);
}

export async function cancelInvoice(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  const reason = str(formData.get("reason"));

  const { data: before } = await supabase
    .from("invoices")
    .select("status, stripe_invoice_id, stripe_mode")
    .eq("id", id)
    .maybeSingle<{ status: string; stripe_invoice_id: string | null; stripe_mode: PaymentMode | null }>();

  // Void it in Stripe first: otherwise the brand could still pay a "cancelled"
  // invoice from Stripe's email. Refused if Stripe says it's already paid.
  if (before?.stripe_invoice_id && before.stripe_mode && before.status !== "paid" && before.status !== "cancelled") {
    try {
      await voidStripeInvoice(before.stripe_mode, before.stripe_invoice_id);
    } catch (err) {
      failTo(id, stripeMessage(err));
    }
  }

  // A paid invoice can't be cancelled (that would be a refund, not a cancel),
  // and cancelling is what frees the campaign to be re-drafted.
  const { data: cancelled } = await supabase
    .from("invoices")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: userId,
      cancel_reason: reason,
    })
    .eq("id", id)
    // …or already cancelled by Stripe's "voided" webhook racing this update
    // (that one has no cancelled_by), so the admin's reason still lands.
    .or("status.in.(draft,sent,overdue),and(status.eq.cancelled,cancelled_by.is.null)")
    .select("reference, brands(profile_id)")
    .maybeSingle<{ reference: string; brands: { profile_id: string } | null }>();

  // Only tell the brand if they had actually received it — a draft was never
  // visible to them.
  if (cancelled?.brands?.profile_id && before && isUnpaidStatus(before.status)) {
    await notify({
      eventKey: "invoice.cancelled",
      recipientProfileId: cancelled.brands.profile_id,
      link: `/dashboard/campaigns/invoices/${id}`,
      variables: {
        reference: cancelled.reference,
        reason: reason ?? "No reason was given — contact us if you have questions.",
      },
    });
  }
  revalidateInvoiceViews(id);
}

const RESEND_COOLDOWN_MS = 10 * 60_000;

/**
 * Sends an unpaid invoice to the brand again — when it went to the wrong
 * place, got lost, or they just need it again. Goes to the brand's CURRENT
 * billing email (they may have corrected a wrong one); the legal snapshot on
 * the invoice itself is left as it was sent.
 *
 * Throttled per invoice (once per 10 minutes, whichever admin presses it) so a
 * brand can't be spammed, and per admin via rate_limit_hit().
 */
export async function resendInvoice(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  const page = `/dashboard/admin/invoices/${id}`;
  const fail = (message: string): never =>
    redirect(`${page}?error=${encodeURIComponent(message)}`);

  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "reference, status, amount_gbp, due_date, resend_count, last_resent_at, billing_snapshot, stripe_invoice_id, stripe_mode, brands(id, profile_id, billing_legal_name, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_postcode, billing_country, vat_number)",
    )
    .eq("id", id)
    .maybeSingle<{
      reference: string;
      status: string;
      amount_gbp: number;
      due_date: string | null;
      resend_count: number;
      last_resent_at: string | null;
      billing_snapshot: BillingSnapshot | null;
      stripe_invoice_id: string | null;
      stripe_mode: PaymentMode | null;
      brands: ({ id: string; profile_id: string } & BillingFields) | null;
    }>();
  if (!inv?.brands) return fail("Invoice not found.");
  if (!isUnpaidStatus(inv.status)) return fail("Only an unpaid invoice can be resent.");

  const cutoff = new Date(Date.now() - RESEND_COOLDOWN_MS).toISOString();
  if (inv.last_resent_at && inv.last_resent_at > cutoff) {
    return fail("This invoice was resent less than 10 minutes ago.");
  }
  const { data: allowed } = await supabase.rpc("rate_limit_hit", {
    p_action: "invoice_resend",
    p_window_seconds: 3600,
    p_max: 20,
  });
  if (allowed !== true) return fail("Too many resends in the last hour — try again later.");

  const toEmail = inv.brands.billing_email ?? inv.billing_snapshot?.email ?? null;
  if (!toEmail) return fail("The brand has no billing email to send to.");

  // Claim the resend first, conditional on nobody else having just done it,
  // so two admins pressing at once send one email.
  const claim = supabase
    .from("invoices")
    .update({
      resend_count: (inv.resend_count ?? 0) + 1,
      last_resent_at: new Date().toISOString(),
      last_resent_by: userId,
    })
    .eq("id", id);
  const { data: claimed } = await (inv.last_resent_at
    ? claim.eq("last_resent_at", inv.last_resent_at)
    : claim.is("last_resent_at", null)
  )
    .select("id")
    .maybeSingle();
  if (!claimed) return fail("Someone else just resent this invoice.");

  // Stripe re-emails its invoice (with the pay button) to the customer's
  // email, which is refreshed to the brand's current billing email first.
  if (inv.stripe_invoice_id && inv.stripe_mode) {
    try {
      await resendStripeInvoice(
        supabase,
        inv.stripe_mode,
        inv.stripe_invoice_id,
        inv.brands.id,
        { ...snapshotBilling(inv.brands), email: toEmail },
      );
    } catch (err) {
      return fail(stripeMessage(err));
    }
  }

  await notify({
    eventKey: "invoice.reminder",
    recipientProfileId: inv.brands.profile_id,
    toEmail,
    link: `/dashboard/campaigns/invoices/${id}`,
    variables: {
      reference: inv.reference,
      amount: formatGbp(inv.amount_gbp),
      due_date: inv.due_date ? formatDate(inv.due_date) : "on receipt",
      invoice_link: invoiceLink(id),
      payment_details: paymentDetailsText(await invoiceContactDetails(supabase)),
    },
  });

  revalidateInvoiceViews(id);
  redirect(`${page}?resent=1`);
}

/**
 * Partial or full refund of a paid invoice — the amount is decided case by
 * case (5 Oct standup) and entered by an admin with a reason. A Stripe-paid
 * invoice is refunded through Stripe first; only once Stripe accepts is the
 * refund recorded, so our ledger never claims money Stripe didn't return.
 * `manual` records a refund already made by bank transfer.
 */
export async function refundInvoice(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  const amount = num(formData.get("amount_gbp"));
  const reason = str(formData.get("reason"));
  const manual = formData.get("manual") === "on";
  if (amount == null || amount <= 0) failTo(id, "Enter the amount to refund.");
  if (!reason) failTo(id, "Give a reason for the refund — the brand sees it.");

  const { data: inv } = await supabase
    .from("invoices")
    .select("reference, status, amount_gbp, refunded_gbp, stripe_invoice_id, stripe_mode, paid_source, brands(profile_id)")
    .eq("id", id)
    .maybeSingle<{
      reference: string;
      status: string;
      amount_gbp: number;
      refunded_gbp: number;
      stripe_invoice_id: string | null;
      stripe_mode: PaymentMode | null;
      paid_source: string | null;
      brands: { profile_id: string } | null;
    }>();
  if (!inv) failTo(id, "Invoice not found.");
  if (inv.status !== "paid") failTo(id, "Only a paid invoice can be refunded.");
  const left = Number(inv.amount_gbp) - Number(inv.refunded_gbp ?? 0);
  if (amount! > left + 1e-9) failTo(id, `You can refund at most ${formatGbp(left)} on this invoice.`);

  let creditNoteId: string | null = null;
  const viaStripe = !manual && inv.paid_source === "stripe" && !!inv.stripe_invoice_id && !!inv.stripe_mode;
  if (viaStripe) {
    try {
      const { count } = await supabase
        .from("invoice_refunds")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", id);
      const note = await refundStripeInvoice(
        inv.stripe_mode!,
        inv.stripe_invoice_id!,
        amount!,
        reason!,
        `les_refund_${id}_${count ?? 0}`,
      );
      creditNoteId = note.id;
    } catch (err) {
      failTo(id, stripeMessage(err));
    }
  }

  const { error } = await supabase.rpc("record_invoice_refund", {
    p_invoice_id: id,
    p_amount: amount,
    p_reason: reason,
    p_method: viaStripe ? "stripe" : "manual",
    p_credit_note_id: creditNoteId,
  });
  if (error) failTo(id, error.message);

  if (inv.brands?.profile_id) {
    await notify({
      eventKey: "invoice.refunded",
      recipientProfileId: inv.brands.profile_id,
      link: `/dashboard/campaigns/invoices/${id}`,
      variables: { reference: inv.reference, amount: formatGbp(amount!), reason: reason! },
    });
  }
  revalidateInvoiceViews(id);
  redirect(`/dashboard/admin/invoices/${id}?refunded=1`);
}
