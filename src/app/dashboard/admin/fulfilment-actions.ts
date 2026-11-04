"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/service";
import { normaliseUrl } from "@/lib/urls";
import type { InvoiceStatus } from "@/lib/fulfilment";

/**
 * The team's side of the artist fulfilment form (migration 0103): write the
 * promotional commitments, special terms, proof requirements and payment
 * terms; review the artist's invoices; put an event live without the form, or
 * take it back to "waiting for fulfilment".
 *
 * The fulfilment row is admin-write-only under RLS; the two overrides run in
 * `admin_set_fulfilment()` (definer, admin-checked, audit-logged).
 */

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/** One entry per non-empty line (commas inside an entry are kept). */
function lines(v: FormDataEntryValue | null, max = 40, maxLen = 300): string[] {
  const out: string[] = [];
  for (const raw of String(v ?? "").split(/\r?\n/)) {
    const s = raw.trim();
    if (s && !out.includes(s)) out.push(s.slice(0, maxLen));
    if (out.length >= max) break;
  }
  return out;
}

function intOrNull(v: FormDataEntryValue | null, label: string, max: number): { value: number | null; error?: string } {
  const s = String(v ?? "").trim();
  if (!s) return { value: null };
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > max) return { value: null, error: `${label} must be a whole number from 0 to ${max}.` };
  return { value: n };
}

const BACK = (eventId: string, params = "") => `/dashboard/admin/events/sponsored/${eventId}${params}#fulfilment`;

const TEXT_MAX = 5000;

function revalidateAll(eventId: string) {
  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
  revalidatePath("/dashboard", "layout");
  // Going live / offline changes what the public site shows.
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
}

/** Saves the commitments + terms. A change clears the artist's consent (trigger). */
export async function saveFulfilmentTerms(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;
  const fail = (msg: string) => redirect(BACK(eventId, `?notice=fulfilment_error&msg=${encodeURIComponent(msg)}`));

  const { data: event } = await supabase
    .from("sponsored_events")
    .select("id, name, reference, event_date, artist_profile_id")
    .eq("id", eventId)
    .maybeSingle<{ id: string; name: string; reference: string; event_date: string | null; artist_profile_id: string | null }>();
  if (!event) return;

  // Channels: the ticked presets plus any extra names, one per line.
  const channels = [
    ...new Set([...formData.getAll("channel_preset").map((v) => String(v).trim()), ...lines(formData.get("channel_extra"), 20, 120)]),
  ].filter(Boolean);

  const posts = intOrNull(formData.get("promo_post_count"), "Number of posts", 1000);
  if (posts.error) fail(posts.error);
  const proofMin = intOrNull(formData.get("proof_min_count"), "Minimum proof uploads", 1000);
  if (proofMin.error) fail(proofMin.error);

  // Handles stay as typed ("@act"); anything that looks like an address is
  // normalised the way every other URL field is (src/lib/urls.ts).
  const urls: string[] = [];
  for (const entry of lines(formData.get("promo_urls"), 30, 300)) {
    if (/^@/.test(entry) || !/[./]/.test(entry)) {
      urls.push(entry);
      continue;
    }
    const n = normaliseUrl(entry, `"${entry}"`);
    if (n.error) fail(n.error);
    if (n.url) urls.push(n.url);
  }

  const startDate = str(formData.get("promo_start_date"));
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) fail("The promotion start date isn't a valid date.");
  if (startDate && event.event_date && startDate > event.event_date) {
    fail("The promotion can't start after the event date.");
  }

  const text = (name: string, label: string) => {
    const v = str(formData.get(name));
    if (v && v.length > TEXT_MAX) fail(`${label} is too long (${TEXT_MAX} characters at most).`);
    return v;
  };
  const row = {
    sponsored_event_id: eventId,
    promo_channels: channels,
    promo_post_count: posts.value,
    promo_urls: urls,
    promo_start_date: startDate,
    promo_post_texts: text("promo_post_texts", "Post texts"),
    promo_other: text("promo_other", "Other promotional requirements"),
    special_terms: text("special_terms", "Special terms"),
    proof_requirements: text("proof_requirements", "Proof requirements"),
    proof_min_count: proofMin.value,
    payment_terms: text("payment_terms", "Payment terms"),
    updated_by: userId,
  };

  const { data: before } = await supabase
    .from("sponsored_event_fulfilment")
    .select("promo_consent_at, final_consent_at")
    .eq("sponsored_event_id", eventId)
    .maybeSingle<{ promo_consent_at: string | null; final_consent_at: string | null }>();

  const { error } = await supabase.from("sponsored_event_fulfilment").upsert(row, { onConflict: "sponsored_event_id" });
  if (error) fail(error.message);

  // Did this edit undo something the artist agreed? (The trigger clears it.)
  const { data: after } = await supabase
    .from("sponsored_event_fulfilment")
    .select("promo_consent_at, final_consent_at")
    .eq("sponsored_event_id", eventId)
    .maybeSingle<{ promo_consent_at: string | null; final_consent_at: string | null }>();
  const reset =
    (!!before?.promo_consent_at && !after?.promo_consent_at) ||
    (!!before?.final_consent_at && !after?.final_consent_at);
  if (reset && event.artist_profile_id) {
    await notify(
      {
        eventKey: "fulfilment.terms_updated",
        recipientProfileId: event.artist_profile_id,
        link: `/dashboard/sponsored/${eventId}#fulfilment`,
        variables: { event_name: event.name, reference: event.reference },
      },
      { client: createServiceClient() ?? supabase },
    );
  }

  await supabase.rpc("log_admin_action", {
    p_action: "fulfilment.terms",
    p_target_type: "sponsored_event",
    p_target_id: eventId,
    p_detail: { consent_reset: reset },
  });

  revalidateAll(eventId);
  redirect(BACK(eventId, `?notice=${reset ? "fulfilment_saved_reset" : "fulfilment_saved"}`));
}

const INVOICE_REVIEW: InvoiceStatus[] = ["submitted", "received", "paid", "rejected"];

/** Mark an artist invoice received / paid / rejected (with an optional note). */
export async function reviewArtistInvoice(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const invoiceId = str(formData.get("invoice_id"));
  const status = str(formData.get("status")) as InvoiceStatus | null;
  if (!eventId || !invoiceId || !status || !INVOICE_REVIEW.includes(status)) return;
  const note = str(formData.get("review_note"))?.slice(0, 1000) ?? null;

  const { error } = await supabase
    .from("artist_invoices")
    .update({
      status,
      review_note: note,
      reviewed_by: status === "submitted" ? null : userId,
      reviewed_at: status === "submitted" ? null : new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .eq("sponsored_event_id", eventId);
  if (error) {
    redirect(BACK(eventId, `?notice=fulfilment_error&msg=${encodeURIComponent(error.message)}`));
  }

  await supabase.rpc("log_admin_action", {
    p_action: "fulfilment.invoice_review",
    p_target_type: "artist_invoice",
    p_target_id: invoiceId,
    p_detail: { status, sponsored_event_id: eventId },
  });

  revalidateAll(eventId);
  redirect(BACK(eventId, "?notice=invoice_reviewed"));
}

const SET_REFUSALS: Record<string, string> = {
  reason_required: "Give a reason (a few words is fine) — it's kept on the audit log.",
  not_found: "That event has no fulfilment form yet.",
  bad_action: "Unknown action.",
};

/** Put an event live without the artist's form (waive), or take it back to waiting (reopen). */
export async function setFulfilmentState(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  const action = str(formData.get("action"));
  if (!eventId || (action !== "waive" && action !== "reopen")) return;

  const { data: outcome, error } = await supabase.rpc("admin_set_fulfilment", {
    p_event_id: eventId,
    p_action: action,
    p_reason: str(formData.get("reason")),
  });
  if (error || outcome !== "ok") {
    const msg = error?.message ?? SET_REFUSALS[outcome as string] ?? "Couldn't change the fulfilment state.";
    redirect(BACK(eventId, `?notice=fulfilment_error&msg=${encodeURIComponent(msg)}`));
  }

  revalidateAll(eventId);
  redirect(BACK(eventId, `?notice=${action === "waive" ? "fulfilment_waived" : "fulfilment_reopened"}`));
}
