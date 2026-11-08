"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";

/**
 * Admin cancellation, request decisions and the registration cap (0114). The
 * work happens in the database functions; these only pass the form through
 * and come back to the event page with what happened.
 */

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function back(id: string, params: Record<string, string>): never {
  const qs = new URLSearchParams(params).toString();
  redirect(`/dashboard/admin/events/sponsored/${id}?${qs}#cancellation`);
}

export async function adminCancelEvent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  const reason = str(formData.get("reason"));
  const note = str(formData.get("note")) || null;
  if (!id) return;
  const { data, error } = await supabase.rpc("admin_cancel_sponsored_event", {
    p_event_id: id,
    p_reason: reason,
    p_note: note,
  });
  revalidatePath(`/dashboard/admin/events/sponsored/${id}`);
  revalidatePath("/dashboard/admin/events");
  revalidatePath("/dashboard/admin");
  if (error) back(id, { cancel_error: error.message });
  const r = (data ?? {}) as { participants?: number; waitlist?: number; code_holders?: number };
  back(id, {
    cancelled: "1",
    told: String((r.participants ?? 0) + (r.waitlist ?? 0)),
    holders: String(r.code_holders ?? 0),
  });
}

export interface DeclineState {
  error?: string;
  message?: string;
}

/** Decline a cancellation request, with the outcome on screen (QA 9 Nov). */
export async function declineCancellationRequest(_prev: DeclineState, formData: FormData): Promise<DeclineState> {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("event_id"));
  const requestId = str(formData.get("request_id"));
  const note = str(formData.get("note")) || null;
  if (!id || !requestId) return { error: "Missing request — refresh the page." };
  const { error } = await supabase.rpc("admin_decline_cancellation_request", {
    p_request_id: requestId,
    p_note: note,
  });
  if (error) return { error: error.message };
  revalidatePath(`/dashboard/admin/events/sponsored/${id}`);
  revalidatePath(`/dashboard/sponsored/${id}`);
  return { message: "Request declined — the requester has been told." };
}

export async function setRegistrationCap(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  const raw = str(formData.get("registration_cap"));
  const cap = raw === "" ? null : Number(raw);
  if (cap !== null && (!Number.isInteger(cap) || cap < 1)) {
    redirect(`/dashboard/admin/events/sponsored/${id}?cap_error=${encodeURIComponent("Enter a whole number of 1 or more, or leave it blank for no limit.")}#capacity`);
  }
  // Raising (or removing) the cap moves waitlisted people up automatically
  // (sponsored_events_promote_on_cap, 0114).
  const { error } = await supabase.from("sponsored_events").update({ registration_cap: cap }).eq("id", id);
  revalidatePath(`/dashboard/admin/events/sponsored/${id}`);
  if (error) {
    redirect(`/dashboard/admin/events/sponsored/${id}?cap_error=${encodeURIComponent(error.message)}#capacity`);
  }
  redirect(`/dashboard/admin/events/sponsored/${id}?cap_saved=1#capacity`);
}
