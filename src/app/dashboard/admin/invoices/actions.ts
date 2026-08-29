"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";
import { sendInvoice } from "@/lib/invoicing";

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

export async function sendInvoiceAction(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("reference, amount_gbp, due_date, brands(brand_name, manager_email, profile_id)")
    .eq("id", id)
    .maybeSingle<{
      reference: string;
      amount_gbp: number;
      due_date: string | null;
      brands: { brand_name: string; manager_email: string | null; profile_id: string } | null;
    }>();
  if (!invoice?.brands) return;

  let brandEmail = invoice.brands.manager_email;
  if (!brandEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", invoice.brands.profile_id)
      .maybeSingle<{ email: string | null }>();
    brandEmail = profile?.email ?? null;
  }
  if (!brandEmail) return;

  const result = await sendInvoice({
    invoiceId: id,
    brandEmail,
    brandName: invoice.brands.brand_name,
    amountGbp: Number(invoice.amount_gbp),
    reference: invoice.reference,
    dueDate: invoice.due_date,
  });
  if (!result.ok) return;

  await supabase
    .from("invoices")
    .update({
      status: "sent",
      sent_at: result.result.sentAt,
      sent_by: userId,
      external_invoice_ref: result.result.externalInvoiceRef,
    })
    .eq("id", id);

  await notify({
    eventKey: "invoice.sent",
    recipientProfileId: invoice.brands.profile_id,
    link: "/dashboard/campaigns",
    variables: {
      reference: invoice.reference,
      amount: `£${Number(invoice.amount_gbp).toLocaleString("en-GB")}`,
    },
  });

  revalidatePath("/dashboard/admin/invoices");
  revalidatePath(`/dashboard/admin/invoices/${id}`);
}

export async function markInvoicePaid(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;

  const { data: updated } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", id)
    .select("reference, amount_gbp, brands(profile_id)")
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
        amount: `£${Number(updated.amount_gbp).toLocaleString("en-GB")}`,
      },
    });
  }

  revalidatePath("/dashboard/admin/invoices");
  revalidatePath(`/dashboard/admin/invoices/${id}`);
}

export async function cancelInvoice(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id);
  revalidatePath("/dashboard/admin/invoices");
  revalidatePath(`/dashboard/admin/invoices/${id}`);
}
