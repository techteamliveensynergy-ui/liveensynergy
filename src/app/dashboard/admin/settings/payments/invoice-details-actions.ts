"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/profile";

export interface InvoiceDetailsState {
  error?: string;
  message?: string;
}

/**
 * WhatsApp number + bank-transfer details printed on invoices and in invoice
 * emails (5 Oct standup). Not secret — every brand sees them — but only an
 * admin can change them (save_invoice_contact_details checks is_admin()).
 */
export async function saveInvoiceDetails(
  _prev: InvoiceDetailsState,
  formData: FormData,
): Promise<InvoiceDetailsState> {
  const { supabase } = await requireAdmin();
  const text = (k: string) => String(formData.get(k) ?? "").trim().slice(0, 2000);
  const whatsapp = text("whatsapp");
  if (whatsapp && !/^\+?[\d\s()-]{7,20}$/.test(whatsapp)) {
    return { error: "That doesn't look like a phone number — include the country code, e.g. +44 7700 900123." };
  }
  const { error } = await supabase.rpc("save_invoice_contact_details", {
    p_whatsapp: whatsapp,
    p_bank_details: text("bank_details"),
    p_contact_note: text("contact_note"),
  });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/admin/settings/payments");
  return { message: "Saved. New invoices and invoice emails will include these details." };
}
