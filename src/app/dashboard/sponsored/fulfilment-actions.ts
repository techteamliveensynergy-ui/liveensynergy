"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";
import { uploadPrivateFile } from "@/lib/storage";
import { TERMS_VERSION } from "@/lib/terms";
import {
  INVOICE_EXTENSIONS,
  INVOICE_TYPES,
  PROMO_CONFIRMATIONS,
  SUBMIT_REFUSALS,
} from "@/lib/fulfilment";

/**
 * The artist's side of the fulfilment form (migration 0103): confirm the
 * promotional commitments, upload an invoice, give the final consent.
 *
 * Every step that decides something goes through a definer RPC — the
 * fulfilment row is admin-write-only, so the artist can't set the flags that
 * take their own event live (the RPCs re-check everything).
 */

export interface FulfilmentActionState {
  error?: string;
  message?: string;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

async function requireArtistOf(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  const { data: event } = await supabase
    .from("sponsored_events")
    .select("id, name, reference, status, artist_profile_id")
    .eq("id", eventId)
    .maybeSingle<{ id: string; name: string; reference: string; status: string; artist_profile_id: string | null }>();
  if (!event || event.artist_profile_id !== user.id) return null;
  return { supabase, userId: user.id, event };
}

/** Everything that shows this event's state, on every screen that does (L6). */
function revalidateFulfilment(eventId: string) {
  revalidatePath(`/dashboard/sponsored/${eventId}`);
  revalidatePath("/dashboard", "layout");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
}

const PROMO_REFUSALS: Record<string, string> = {
  forbidden: SUBMIT_REFUSALS.forbidden,
  not_ready: SUBMIT_REFUSALS.not_ready,
  nothing_to_confirm: "There are no promotional commitments to confirm on this event.",
  already_confirmed: "You've already confirmed these.",
  statements_required: "Tick all four confirmations.",
};

/** Step: agree the promotional commitments (all four confirmations). */
export async function confirmPromotionTerms(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const eventId = str(formData.get("event_id"));
  if (!eventId) return { error: "Missing partnership." };

  // Every confirmation, ticked — checked here so the message is specific, and
  // again in the database.
  const ticked = PROMO_CONFIRMATIONS.filter((_, i) => formData.get(`confirm_${i}`) === "on");
  if (ticked.length !== PROMO_CONFIRMATIONS.length) {
    return { error: "Tick all four confirmations to agree the promotional commitments." };
  }

  const ctx = await requireArtistOf(eventId);
  if (!ctx) return { error: SUBMIT_REFUSALS.forbidden };

  const { data: outcome, error } = await ctx.supabase.rpc("confirm_promotion_terms", {
    p_event_id: eventId,
    p_statements: [...ticked],
  });
  if (error) return { error: error.message };
  if (outcome !== "confirmed") {
    return { error: PROMO_REFUSALS[outcome as string] ?? "Couldn't record your confirmation." };
  }

  revalidateFulfilment(eventId);
  return { message: "Confirmed — thank you." };
}

const MAX_INVOICE_NUMBER = 100;

/** Step: upload an invoice. Each upload is kept; the latest is the current one. */
export async function uploadArtistInvoice(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const eventId = str(formData.get("event_id"));
  if (!eventId) return { error: "Missing partnership." };
  const ctx = await requireArtistOf(eventId);
  if (!ctx) return { error: SUBMIT_REFUSALS.forbidden };
  if (!["confirmed", "completed"].includes(ctx.event.status)) {
    return { error: SUBMIT_REFUSALS.not_confirmed };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose your invoice file." };
  // PDF or an image only — an invoice is read by a person, and the private
  // bucket accepts anything.
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!INVOICE_TYPES.includes(file.type) || !INVOICE_EXTENSIONS.includes(ext)) {
    return { error: "The invoice must be a PDF or an image (JPG, PNG or WebP)." };
  }

  const invoiceNumber = str(formData.get("invoice_number"));
  if (invoiceNumber && invoiceNumber.length > MAX_INVOICE_NUMBER) {
    return { error: "The invoice number is too long." };
  }
  let amount: number | null = null;
  const rawAmount = str(formData.get("amount_gbp"));
  if (rawAmount) {
    amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount < 0) return { error: "Enter the invoice total as a positive amount." };
    amount = Math.round(amount * 100) / 100;
  }
  const note = str(formData.get("note"));
  if (note && note.length > 1000) return { error: "The note is too long (1,000 characters at most)." };

  const upload = await uploadPrivateFile(file, "artist-invoice", { supabase: ctx.supabase, userId: ctx.userId });
  if (upload.error) return { error: upload.error };
  if (!upload.path) return { error: "Choose your invoice file." };

  const { error } = await ctx.supabase.from("artist_invoices").insert({
    sponsored_event_id: eventId,
    uploaded_by: ctx.userId,
    file_path: upload.path,
    file_name: upload.name ?? null,
    invoice_number: invoiceNumber,
    amount_gbp: amount,
    note,
  });
  if (error) return { error: error.message };

  await notifyAdmins({
    eventKey: "admin.artist_invoice_uploaded",
    link: `/dashboard/admin/events/sponsored/${eventId}#fulfilment`,
    variables: { event_name: ctx.event.name, reference: ctx.event.reference },
  });

  revalidateFulfilment(eventId);
  return { message: "Invoice uploaded." };
}

/** Final step: the consent, and the event goes live. */
export async function submitFulfilment(
  _prev: FulfilmentActionState,
  formData: FormData,
): Promise<FulfilmentActionState> {
  const eventId = str(formData.get("event_id"));
  if (!eventId) return { error: "Missing partnership." };
  if (formData.get("consent") !== "on") return { error: SUBMIT_REFUSALS.consent_required };

  const ctx = await requireArtistOf(eventId);
  if (!ctx) return { error: SUBMIT_REFUSALS.forbidden };

  const { data: outcome, error } = await ctx.supabase.rpc("submit_artist_fulfilment", {
    p_event_id: eventId,
    p_terms_version: TERMS_VERSION,
    p_consent: true,
  });
  if (error) return { error: error.message };
  if (outcome !== "submitted" && outcome !== "re_confirmed") {
    return { error: SUBMIT_REFUSALS[outcome as string] ?? "Couldn't submit the form." };
  }

  // Never report success unless the row really changed (QA 30 Oct #2).
  const { data: after } = await ctx.supabase
    .from("sponsored_event_fulfilment")
    .select("completed_at, final_consent_at")
    .eq("sponsored_event_id", eventId)
    .maybeSingle<{ completed_at: string | null; final_consent_at: string | null }>();
  if (!after?.completed_at || !after.final_consent_at) {
    return { error: "Your submission didn't save. Please try again, or message the team." };
  }

  if (outcome === "submitted") {
    const vars = { event_name: ctx.event.name, reference: ctx.event.reference };
    await notify({
      eventKey: "fulfilment.live",
      recipientProfileId: ctx.userId,
      link: `/dashboard/sponsored/${eventId}`,
      variables: vars,
    });
    await notifyAdmins({
      eventKey: "admin.fulfilment_submitted",
      link: `/dashboard/admin/events/sponsored/${eventId}#fulfilment`,
      variables: vars,
    });
  }

  revalidateFulfilment(eventId);
  return {
    message:
      outcome === "submitted"
        ? "Submitted — your event is now live."
        : "Confirmed again — thank you.",
  };
}
