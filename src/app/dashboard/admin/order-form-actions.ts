"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";
import { uploadImage } from "@/lib/storage";
import { normaliseUrl } from "@/lib/urls";
import { draftCampaignInvoice } from "@/lib/billing-server";
import { formatGbp } from "@/lib/billing";
import { INVOICE } from "@/lib/constants";
import { missingForSend, vatFor, type SurveyType } from "@/lib/order-forms";
import type { InvoiceLine } from "@/lib/types";

export interface OrderFormState {
  error?: string;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}
function int(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}
function money(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(/[£,]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
const SURVEY_TYPES: SurveyType[] = ["pre", "post", "pre_post"];

function orderFormLink(id: string): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return origin
    ? `${origin}/dashboard/campaigns/order-forms/${id}`
    : "your Live·En·Synergy dashboard, under Campaigns";
}

/**
 * Saves (and with intent=send, sends) a campaign's order form. One form per
 * campaign; an approved form is locked — the brand agreed to it.
 *
 * The form's commercial figures are the campaign's billing figures: the
 * campaign fee becomes the campaign budget, and the campaign's DRAFT invoice
 * is rebuilt from fee + VAT with the payment date as its due date. Once an
 * invoice has been sent the money is locked (cancel it first) — the same rule
 * updateCampaignAdmin applies.
 */
export async function saveOrderForm(
  _prev: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const { supabase, userId } = await requireAdmin();
  const campaignId = str(formData.get("campaign_id"));
  const intent = str(formData.get("intent")) === "send" ? "send" : "save";
  if (!campaignId) return { error: "Missing campaign." };

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, reference, brand_id, budget_gbp, campaign_package_id, package_platform_margin_gbp, campaign_packages(name), brands(profile_id)")
    .eq("id", campaignId)
    .maybeSingle<{
      id: string;
      reference: string;
      brand_id: string;
      budget_gbp: number;
      campaign_package_id: string | null;
      package_platform_margin_gbp: number | null;
      campaign_packages: { name: string } | null;
      brands: { profile_id: string } | null;
    }>();
  if (!campaign) return { error: "Campaign not found." };

  const { data: existing } = await supabase
    .from("campaign_order_forms")
    .select("id, status, media_image_urls")
    .eq("campaign_id", campaignId)
    .maybeSingle<{ id: string; status: string; media_image_urls: string[] }>();
  if (existing?.status === "approved") {
    return { error: "This order form has been approved by the brand, so it can no longer be changed." };
  }

  // --- Linked event: the artist is taken from the listing itself, never from
  // the form, because it decides who can read the artist brief.
  const listingId = str(formData.get("listing_id"));
  let artistProfileId: string | null = null;
  if (listingId) {
    const { data: listing } = await supabase
      .from("event_listings")
      .select("owner_profile_id")
      .eq("id", listingId)
      .maybeSingle<{ owner_profile_id: string }>();
    if (!listing) return { error: "That event no longer exists — pick another." };
    artistProfileId = listing.owner_profile_id;
  }

  // --- Commercial
  const fee = money(formData.get("campaign_fee_gbp"));
  const vat = money(formData.get("vat_gbp"));
  if (fee != null && fee <= 0) return { error: "The campaign fee must be more than £0." };
  if (fee != null && vat != null) {
    // Stripe applies the account's 20% VAT rate to the fee, and refuses to send
    // an invoice whose total differs from ours — so VAT is 20% or zero-rated.
    const standard = vatFor(fee, INVOICE.vatRate);
    if (vat !== 0 && Math.abs(vat - standard) > 0.009) {
      return {
        error: `VAT must be ${formatGbp(standard)} (20% of the fee), or £0 if the campaign is zero-rated.`,
      };
    }
  }
  const margin = campaign.package_platform_margin_gbp != null ? Number(campaign.package_platform_margin_gbp) : null;
  if (fee != null && margin != null && fee <= margin) {
    return { error: `The campaign fee must be more than the platform margin (${formatGbp(margin)}).` };
  }

  // --- Media (large imagery for the brand's review screen)
  const keep = formData.getAll("media_keep").map(String).filter((u) => (existing?.media_image_urls ?? []).includes(u));
  const uploaded: string[] = [];
  for (const file of formData.getAll("media_images")) {
    const up = await uploadImage(file, "order-forms", { supabase, userId });
    if (up.error) return { error: `Image upload failed: ${up.error}` };
    if (up.url) uploaded.push(up.url);
  }
  const surveyType = str(formData.get("survey_type"));
  const surveyLink = normaliseUrl(formData.get("draft_survey_link"), "The draft survey link");
  if (surveyLink.error) return { error: surveyLink.error };
  const videoLink = normaliseUrl(formData.get("media_video_url"), "The video link");
  if (videoLink.error) return { error: videoLink.error };

  const row = {
    campaign_id: campaignId,
    brand_id: campaign.brand_id,
    brand_company_name: str(formData.get("brand_company_name")),
    brand_address: str(formData.get("brand_address")),
    contact_name: str(formData.get("contact_name")),
    contact_email: str(formData.get("contact_email")),
    campaign_name: str(formData.get("campaign_name")),
    campaign_objective: str(formData.get("campaign_objective")),
    campaign_timeline: str(formData.get("campaign_timeline")),
    listing_id: listingId,
    artist_profile_id: artistProfileId,
    artist_name: str(formData.get("artist_name")),
    event_name: str(formData.get("event_name")),
    event_reference: str(formData.get("event_reference")),
    event_date: str(formData.get("event_date")),
    event_venue: str(formData.get("event_venue")),
    event_location: str(formData.get("event_location")),
    approx_participants: int(formData.get("approx_participants")),
    survey_type: surveyType && (SURVEY_TYPES as string[]).includes(surveyType) ? (surveyType as SurveyType) : null,
    survey_question_count: int(formData.get("survey_question_count")),
    research_questions: str(formData.get("research_questions")),
    draft_survey_link: surveyLink.url,
    discount_reward: str(formData.get("discount_reward")),
    rewards_available: int(formData.get("rewards_available")),
    redemption_arrangements: str(formData.get("redemption_arrangements")),
    social_media_details: str(formData.get("social_media_details")),
    other_details: str(formData.get("other_details")),
    media_image_urls: [...keep, ...uploaded].slice(0, 8),
    media_video_url: videoLink.url,
    campaign_package_id: str(formData.get("campaign_package_id")),
    campaign_fee_gbp: fee,
    vat_gbp: vat,
    total_gbp: fee != null && vat != null ? Math.round((fee + vat) * 100) / 100 : null,
    payment_date: str(formData.get("payment_date")),
  };

  if (intent === "send") {
    const missing = missingForSend(row);
    if (missing.length) return { error: `Fill in before sending: ${missing.join(", ")}.` };
  }

  // --- Keep the campaign and its draft invoice in step with the form's money.
  if (fee != null && vat != null) {
    const synced = await syncCampaignBilling(supabase, campaign, fee, vat, row.campaign_package_id, row.payment_date);
    if (synced) return { error: synced };
  }

  const { data: saved, error } = await supabase
    .from("campaign_order_forms")
    .upsert(
      {
        ...row,
        ...(existing ? {} : { created_by: userId }),
        ...(intent === "send"
          ? { status: "sent", sent_at: new Date().toISOString(), sent_by: userId }
          : {}),
      },
      { onConflict: "campaign_id" },
    )
    .select("id, reference")
    .single();
  if (error) return { error: error.message };

  if (intent === "send" && campaign.brands?.profile_id) {
    await notify({
      eventKey: "order_form.sent",
      recipientProfileId: campaign.brands.profile_id,
      toEmail: row.contact_email ?? undefined,
      link: `/dashboard/campaigns/order-forms/${saved.id}`,
      variables: {
        reference: saved.reference,
        campaign_reference: campaign.reference,
        order_form_link: orderFormLink(saved.id),
      },
    });
  }

  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath(`/dashboard/admin/campaigns/${campaignId}/order-form`);
  revalidatePath("/dashboard/admin/invoices");
  revalidatePath("/dashboard/campaigns");
  revalidatePath(`/dashboard/campaigns/order-forms/${saved.id}`);
  redirect(`/dashboard/admin/campaigns/${campaignId}/order-form?${intent === "send" ? "sent" : "saved"}=1`);
}

/** Returns an error message, or null when the campaign + draft invoice now match the form. */
async function syncCampaignBilling(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  campaign: {
    id: string;
    reference: string;
    budget_gbp: number;
    campaign_package_id: string | null;
    campaign_packages: { name: string } | null;
  },
  fee: number,
  vat: number,
  packageId: string | null,
  paymentDate: string | null,
): Promise<string | null> {
  const total = Math.round((fee + vat) * 100) / 100;

  const { data: issued } = await supabase
    .from("invoices")
    .select("reference, status, amount_gbp")
    .eq("campaign_id", campaign.id)
    .eq("kind", "campaign_package")
    .in("status", ["sent", "overdue", "paid"])
    .limit(1)
    .maybeSingle<{ reference: string; status: string; amount_gbp: number }>();
  if (issued) {
    if (Math.abs(Number(issued.amount_gbp) - total) < 0.005) return null;
    return issued.status === "paid"
      ? `Invoice ${issued.reference} has been paid, so the commercial terms are locked.`
      : `Invoice ${issued.reference} has already been sent for ${formatGbp(issued.amount_gbp)}. Cancel it on the invoice page before changing the fee.`;
  }

  if (Number(campaign.budget_gbp) !== fee || (packageId ?? null) !== (campaign.campaign_package_id ?? null)) {
    const { error } = await supabase
      .from("campaigns")
      .update({ budget_gbp: fee, campaign_package_id: packageId })
      .eq("id", campaign.id);
    if (error) return `Couldn't update the campaign budget: ${error.message}`;
  }

  let { data: draft } = await supabase
    .from("invoices")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("kind", "campaign_package")
    .eq("status", "draft")
    .maybeSingle<{ id: string }>();
  if (!draft) {
    const drafted = await draftCampaignInvoice(supabase, campaign.id);
    if (!drafted.ok) return `Couldn't draft the invoice: ${drafted.error}`;
    if (drafted.invoiceId) draft = { id: drafted.invoiceId };
  }
  if (!draft) return null;

  let packageName = campaign.campaign_packages?.name ?? null;
  if (packageId && packageId !== campaign.campaign_package_id) {
    const { data: pkg } = await supabase
      .from("campaign_packages")
      .select("name")
      .eq("id", packageId)
      .maybeSingle<{ name: string }>();
    packageName = pkg?.name ?? null;
  }
  const line: InvoiceLine = {
    kind: "package",
    description: `${packageName ? `Sponsorship package: ${packageName}` : "Sponsorship campaign"} (${campaign.reference})`,
    net_gbp: fee,
    vat_rate: vat === 0 ? 0 : INVOICE.vatRate,
    vat_gbp: vat,
    total_gbp: total,
  };
  const { error } = await supabase
    .from("invoices")
    .update({
      lines: [line],
      subtotal_gbp: fee,
      vat_gbp: vat,
      amount_gbp: total,
      due_date: paymentDate,
    })
    .eq("id", draft.id)
    .eq("status", "draft");
  if (error) return `Couldn't update the draft invoice: ${error.message}`;
  return null;
}

/** Pulls a sent form back to draft so it can be reworked before the brand approves. */
export async function withdrawOrderForm(formData: FormData) {
  const { supabase } = await requireAdmin();
  const campaignId = str(formData.get("campaign_id"));
  if (!campaignId) return;
  await supabase
    .from("campaign_order_forms")
    .update({ status: "draft" })
    .eq("campaign_id", campaignId)
    .in("status", ["sent", "changes_requested"]);
  revalidatePath(`/dashboard/admin/campaigns/${campaignId}/order-form`);
  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/campaigns");
  redirect(`/dashboard/admin/campaigns/${campaignId}/order-form`);
}
