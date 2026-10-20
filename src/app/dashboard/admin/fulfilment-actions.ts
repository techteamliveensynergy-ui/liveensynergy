"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify } from "@/lib/notifications";
import { formatDate } from "@/lib/format";
import {
  defaultCodesDeadline,
  isPromoChannelKey,
  missingForSend,
  type FulfilmentFormStatus,
} from "@/lib/fulfilment-forms";

export interface FulfilmentAdminState {
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
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null;
}
function isoDate(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function formLink(eventId: string): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  return origin
    ? `${origin}/dashboard/sponsored/${eventId}#fulfilment`
    : "your Live·En·Synergy dashboard, under Sponsored events";
}

/** Only these statuses may be edited; a sent or submitted form is reopened
 *  first, so the artist never ticks boxes against terms that moved under them. */
const EDITABLE: (FulfilmentFormStatus | null)[] = [null, "draft", "changes_requested"];

/**
 * Saves (and with intent=send, sends) a sponsored event's fulfilment form.
 * Creates the row on first save — one form per sponsored event.
 */
export async function saveFulfilmentForm(
  _prev: FulfilmentAdminState,
  formData: FormData,
): Promise<FulfilmentAdminState> {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("sponsored_event_id"));
  const intent = str(formData.get("intent")) === "send" ? "send" : "save";
  if (!eventId) return { error: "Missing sponsored event." };

  const [{ data: event }, { data: existing }] = await Promise.all([
    supabase
      .from("sponsored_events")
      .select("id, name, reference, status, artist_profile_id")
      .eq("id", eventId)
      .maybeSingle<{ id: string; name: string; reference: string; status: string; artist_profile_id: string | null }>(),
    supabase
      .from("artist_fulfilment_forms")
      .select("id, status, codes_deadline")
      .eq("sponsored_event_id", eventId)
      .maybeSingle<{ id: string; status: FulfilmentFormStatus; codes_deadline: string | null }>(),
  ]);
  if (!event) return { error: "Sponsored event not found." };
  if (event.status === "withdrawn") return { error: "This sponsorship was withdrawn — there's nothing for the artist to fulfil." };
  if (!EDITABLE.includes(existing?.status ?? null)) {
    return { error: "This form is with the artist. Reopen it for editing first." };
  }

  const ticked = formData.getAll("promo_channels").map(String).filter(isPromoChannelKey);
  // "Other agreed channel" — any number of names, one per line or comma-separated.
  const custom = String(formData.get("promo_channels_custom") ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);

  const postCountRaw = str(formData.get("promo_post_count"));
  const postCount = int(postCountRaw);
  if (postCountRaw && postCount == null) return { error: "Number of agreed posts must be a whole number (0–1000)." };

  const fields = {
    codes_deadline: isoDate(formData.get("codes_deadline")),
    promo_channels: ticked,
    promo_channels_custom: custom,
    promo_post_count: postCount,
    promo_start_date: isoDate(formData.get("promo_start_date")),
    promo_social_handles: str(formData.get("promo_social_handles")),
    promo_post_texts: str(formData.get("promo_post_texts")),
    promo_other_requirements: str(formData.get("promo_other_requirements")),
    special_terms: str(formData.get("special_terms")),
    payment_terms: str(formData.get("payment_terms")),
  };

  const sending = intent === "send";
  if (sending) {
    if (!event.artist_profile_id) return { error: "This event has no artist or organiser to send the form to." };
    const missing = missingForSend(fields);
    if (missing.length) return { error: `Before sending, add ${missing.join(" and ")}.` };
  }

  const row = {
    ...fields,
    ...(sending
      ? {
          status: "sent" as const,
          codes_deadline: fields.codes_deadline ?? defaultCodesDeadline(),
          sent_at: new Date().toISOString(),
          sent_by: userId,
          // A fresh round: nothing the artist ticked against the old version counts.
          consent_publish: false,
          consent_materials: false,
          consent_terms_privacy: false,
        }
      : {}),
  };

  const { error } = existing
    ? await supabase.from("artist_fulfilment_forms").update(row).eq("id", existing.id)
    : await supabase
        .from("artist_fulfilment_forms")
        .insert({ ...row, sponsored_event_id: eventId, created_by: userId });
  if (error) return { error: error.message };

  if (sending && event.artist_profile_id) {
    await notify({
      eventKey: "fulfilment.sent",
      recipientProfileId: event.artist_profile_id,
      link: `/dashboard/sponsored/${eventId}#fulfilment`,
      variables: {
        event_name: event.name,
        reference: event.reference,
        codes_deadline: formatDate(row.codes_deadline),
        form_link: formLink(eventId),
      },
    });
  }

  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
  redirect(`/dashboard/admin/events/sponsored/${eventId}?notice=fulfilment_${sending ? "sent" : "saved"}#fulfilment`);
}

/**
 * Takes a sent or submitted form back to draft so the team can change it.
 * The artist's consents are cleared — they confirm the new version — but
 * their payment details and invoices stay. The consent log keeps the earlier
 * submission (0080 records are permanent).
 */
export async function reopenFulfilmentForm(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = str(formData.get("sponsored_event_id"));
  if (!eventId) return;

  await supabase
    .from("artist_fulfilment_forms")
    .update({
      status: "draft",
      consent_publish: false,
      consent_materials: false,
      consent_terms_privacy: false,
      submitted_at: null,
      submitted_by: null,
    })
    .eq("sponsored_event_id", eventId)
    .in("status", ["sent", "changes_requested", "submitted"]);

  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
  redirect(`/dashboard/admin/events/sponsored/${eventId}?notice=fulfilment_reopened#fulfilment`);
}
