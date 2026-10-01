"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";
import { sendInvoice } from "@/lib/invoicing";
import { INVOICE } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { draftCampaignInvoice } from "@/lib/billing-server";
import { notifyCampaignOpened } from "@/lib/campaign-payment";
import {
  formatGbp,
  isBillingComplete,
  isUnpaidStatus,
  snapshotBilling,
  type BillingFields,
} from "@/lib/billing";
import type { InvoiceLine } from "@/lib/types";

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

/** Absolute link for emails (an unresolved token would show as {{invoice_link}}). */
function invoiceLink(id: string): string {
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

export async function sendInvoiceAction(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "reference, status, amount_gbp, due_date, lines, subtotal_gbp, vat_gbp, brands(profile_id, billing_legal_name, billing_email, billing_address_line1, billing_address_line2, billing_city, billing_postcode, billing_country, vat_number)",
    )
    .eq("id", id)
    .maybeSingle<{
      reference: string;
      status: string;
      amount_gbp: number;
      due_date: string | null;
      lines: InvoiceLine[] | null;
      subtotal_gbp: number | null;
      vat_gbp: number | null;
      brands: ({ profile_id: string } & BillingFields) | null;
    }>();
  if (!invoice?.brands || invoice.status !== "draft") return;

  // An invoice is a legal document: it goes to a named company at an address.
  // The detail page disables Send and lists what's missing; this is the backstop.
  if (!isBillingComplete(invoice.brands)) return;
  const billing = snapshotBilling(invoice.brands);

  const dueDate = invoice.due_date ?? plusDays(INVOICE.paymentTermsDays);

  const result = await sendInvoice({
    invoiceId: id,
    brandEmail: billing.email as string,
    brandName: billing.legal_name as string,
    amountGbp: Number(invoice.amount_gbp),
    reference: invoice.reference,
    dueDate,
    billing,
    lines: invoice.lines,
    subtotalGbp: invoice.subtotal_gbp != null ? Number(invoice.subtotal_gbp) : null,
    vatGbp: invoice.vat_gbp != null ? Number(invoice.vat_gbp) : null,
  });
  if (!result.ok) return;

  // Conditional on still being a draft, so a double-click can't send (and
  // notify) twice; the billing details are frozen onto the invoice here.
  const { data: sent } = await supabase
    .from("invoices")
    .update({
      status: "sent",
      sent_at: result.result.sentAt,
      sent_by: userId,
      external_invoice_ref: result.result.externalInvoiceRef,
      billing_snapshot: billing,
      due_date: dueDate,
    })
    .eq("id", id)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (!sent) return;

  await notify({
    eventKey: "invoice.sent",
    recipientProfileId: invoice.brands.profile_id,
    // The invoice email goes to the billing address (often an accounts team),
    // not the brand user's login email; the in-app notice still goes to them.
    toEmail: billing.email ?? undefined,
    link: `/dashboard/campaigns/invoices/${id}`,
    // Reaches an email, so it must be an absolute URL — and the template has
    // no other fallback for an unresolved token.
    variables: {
      reference: invoice.reference,
      amount: formatGbp(invoice.amount_gbp),
      due_date: formatDate(dueDate),
      invoice_link: invoiceLink(id),
    },
  });

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
    .select("status")
    .eq("id", id)
    .maybeSingle<{ status: string }>();

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
    .in("status", ["draft", "sent", "overdue"])
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
      "reference, status, amount_gbp, due_date, resend_count, last_resent_at, billing_snapshot, brands(profile_id, billing_email)",
    )
    .eq("id", id)
    .maybeSingle<{
      reference: string;
      status: string;
      amount_gbp: number;
      due_date: string | null;
      resend_count: number;
      last_resent_at: string | null;
      billing_snapshot: { email: string | null } | null;
      brands: { profile_id: string; billing_email: string | null } | null;
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
    },
  });

  revalidateInvoiceViews(id);
  redirect(`${page}?resent=1`);
}
