"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { notifyAdmins } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/service";
import { deliverInvoice } from "@/lib/invoice-delivery";
import { draftCampaignInvoice } from "@/lib/billing-server";

export interface OrderFormReviewState {
  error?: string;
}

/**
 * The brand approves its order form (both consents), which moves the campaign
 * straight on to billing — the Admin Portal brief's open question, answered
 * yes. The approval itself runs as the brand (approve_campaign_order_form
 * checks it is theirs); sending the invoice needs the server's own client
 * because the brand can't write invoices. If the invoice can't go out (no
 * billing details, Stripe down) the approval still stands and admins are told.
 */
export async function approveOrderForm(
  _prev: OrderFormReviewState,
  formData: FormData,
): Promise<OrderFormReviewState> {
  const { supabase } = await requireRole(["brand"]);
  const id = String(formData.get("id") ?? "");
  const details = formData.get("consent_details") === "on";
  const terms = formData.get("consent_terms") === "on";
  if (!details || !terms) return { error: "Please tick both boxes to approve the order form." };

  const { data, error } = await supabase.rpc("approve_campaign_order_form", {
    p_form_id: id,
    p_details_approved: details,
    p_terms_accepted: terms,
  });
  if (error) return { error: error.message };
  const campaignId = (data as { campaign_id?: string } | null)?.campaign_id;

  let invoiceId: string | null = null;
  let invoiceStatus = "not sent — check the campaign";
  const service = createServiceClient();
  if (service && campaignId) {
    const { data: form } = await service
      .from("campaign_order_forms")
      .select("reference, campaigns(reference), brands(brand_name)")
      .eq("id", id)
      .maybeSingle<{ reference: string; campaigns: { reference: string } | null; brands: { brand_name: string } | null }>();

    let { data: draft } = await service
      .from("invoices")
      .select("id, status")
      .eq("campaign_id", campaignId)
      .eq("kind", "campaign_package")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string }>();
    if (!draft) {
      const drafted = await draftCampaignInvoice(service, campaignId);
      if (drafted.ok && drafted.invoiceId) draft = { id: drafted.invoiceId, status: "draft" };
    }
    if (draft) {
      invoiceId = draft.id;
      if (draft.status === "draft") {
        const sent = await deliverInvoice({ client: service, invoiceId: draft.id, actorId: null, asService: true });
        invoiceStatus = sent.ok ? `sent to the brand (${sent.via === "stripe" ? "Stripe" : "bank transfer"})` : `NOT sent — ${sent.error}`;
        if (!sent.ok) invoiceId = null;
      } else {
        invoiceStatus = `already ${draft.status}`;
      }
    }

    await notifyAdmins(
      {
        eventKey: "admin.order_form_approved",
        link: `/dashboard/admin/campaigns/${campaignId}/order-form`,
        variables: {
          reference: form?.reference ?? "order form",
          campaign_reference: form?.campaigns?.reference ?? "",
          brand_name: form?.brands?.brand_name ?? "The brand",
          invoice_status: invoiceStatus,
        },
      },
      { client: service },
    );
  }

  revalidatePath(`/order-forms/${id}`);
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/admin/campaigns");
  revalidatePath("/dashboard/admin/invoices");
  if (invoiceId) {
    revalidatePath(`/dashboard/campaigns/invoices/${invoiceId}`);
    redirect(`/dashboard/campaigns/invoices/${invoiceId}?approved=1`);
  }
  redirect(`/order-forms/${id}?approved=1`);
}

export async function requestOrderFormChanges(
  _prev: OrderFormReviewState,
  formData: FormData,
): Promise<OrderFormReviewState> {
  const { supabase } = await requireRole(["brand"]);
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Tell us what you'd like changed." };

  const { error } = await supabase.rpc("request_campaign_order_form_changes", {
    p_form_id: id,
    p_note: note,
  });
  if (error) return { error: error.message };

  const { data: form } = await supabase
    .from("campaign_order_forms")
    .select("reference, campaign_id, campaigns(reference), brands(brand_name)")
    .eq("id", id)
    .maybeSingle<{ reference: string; campaign_id: string; campaigns: { reference: string } | null; brands: { brand_name: string } | null }>();
  const service = createServiceClient();
  await notifyAdmins(
    {
      eventKey: "admin.order_form_changes_requested",
      link: form ? `/dashboard/admin/campaigns/${form.campaign_id}/order-form` : "/dashboard/admin/campaigns",
      variables: {
        reference: form?.reference ?? "order form",
        campaign_reference: form?.campaigns?.reference ?? "",
        brand_name: form?.brands?.brand_name ?? "The brand",
        note,
      },
    },
    service ? { client: service } : {},
  );

  revalidatePath(`/order-forms/${id}`);
  revalidatePath("/dashboard/campaigns");
  revalidatePath("/dashboard/admin/campaigns");
  redirect(`/order-forms/${id}?changes=1`);
}
