"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/profile";
import { notify, notifyAdmins } from "@/lib/notifications";
import { linesToList } from "@/lib/fulfilment";

/**
 * The team's side of the Artist/Organiser Fulfilment Form (0104): fill it in,
 * then mark it ready for the artist. Every status change tells the artist and
 * the admins, in-app and by email.
 */

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function backTo(eventId: string, notice: string, msg?: string) {
  const q = new URLSearchParams({ notice });
  if (msg) q.set("msg", msg);
  return `/dashboard/admin/events/sponsored/${eventId}?${q.toString()}#fulfilment`;
}

async function eventFacts(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  eventId: string,
) {
  const { data } = await supabase
    .from("sponsored_events")
    .select("id, name, reference, artist_profile_id, event_date, timezone, reward_codes_confirmed_at")
    .eq("id", eventId)
    .maybeSingle<{
      id: string;
      name: string;
      reference: string | null;
      artist_profile_id: string | null;
      event_date: string | null;
      timezone: string | null;
      reward_codes_confirmed_at: string | null;
    }>();
  return data;
}

function revalidateFulfilment(eventId: string) {
  revalidatePath(`/dashboard/admin/events/sponsored/${eventId}`);
  revalidatePath(`/dashboard/sponsored/${eventId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
}

/** Saves the form. Editing one the artist already consented to clears that
 *  consent, so they confirm the version they've actually read. */
export async function saveFulfilmentForm(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;

  const postCountRaw = str(formData.get("promo_post_count"));
  const postCount = postCountRaw == null ? null : Number.parseInt(postCountRaw, 10);
  if (postCount != null && (!Number.isFinite(postCount) || postCount < 0)) {
    redirect(backTo(eventId, "fulfilment_error", "Number of agreed posts must be 0 or more."));
  }

  const { data: existing } = await supabase
    .from("sponsored_event_fulfilment")
    .select("ready_at, artist_ack_at")
    .eq("sponsored_event_id", eventId)
    .maybeSingle<{ ready_at: string | null; artist_ack_at: string | null }>();

  const row = {
    sponsored_event_id: eventId,
    promo_channels: linesToList(formData.get("promo_channels")),
    promo_post_count: postCount,
    promo_social_urls: linesToList(formData.get("promo_social_urls")),
    promo_start_date: str(formData.get("promo_start_date")),
    // Post texts can be multi-line, so they're separated by a line with "---".
    promo_post_texts: String(formData.get("promo_post_texts") ?? "")
      .split(/\r?\n-{3,}\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20),
    promo_other: str(formData.get("promo_other")),
    special_terms: str(formData.get("special_terms")),
    updated_by: userId,
    // A change after the artist consented clears the consent.
    ...(existing?.artist_ack_at ? { artist_ack_at: null } : {}),
  };

  const { error } = await supabase
    .from("sponsored_event_fulfilment")
    .upsert(row, { onConflict: "sponsored_event_id" });
  if (error) redirect(backTo(eventId, "fulfilment_error", error.message));

  // Already sent → the artist and the team hear that it changed.
  if (existing?.ready_at) {
    const ev = await eventFacts(supabase, eventId);
    const variables = { event_name: ev?.name ?? "your partnership", reference: ev?.reference ?? "" };
    if (ev?.artist_profile_id) {
      await notify({
        eventKey: "fulfilment.form_updated",
        recipientProfileId: ev.artist_profile_id,
        link: `/dashboard/sponsored/${eventId}#fulfilment`,
        variables,
      });
    }
    await notifyAdmins({
      eventKey: "admin.fulfilment_updated",
      link: `/dashboard/admin/events/sponsored/${eventId}#fulfilment`,
      variables,
    });
  }

  await supabase.rpc("log_admin_action", {
    p_action: "sponsorship.fulfilment_saved",
    p_target_type: "sponsored_event",
    p_target_id: eventId,
    p_detail: { consent_cleared: Boolean(existing?.artist_ack_at) },
  });

  revalidateFulfilment(eventId);
  redirect(backTo(eventId, existing?.artist_ack_at ? "fulfilment_saved_cleared" : "fulfilment_saved"));
}

/**
 * Sends the form to the artist. Starts the one-week discount-code deadline
 * from now (it used to start when the partnership was created, before the team
 * had filled anything in) unless the codes are already confirmed.
 */
export async function markFulfilmentReady(formData: FormData) {
  const { supabase, userId } = await requireAdmin();
  const eventId = str(formData.get("event_id"));
  if (!eventId) return;

  const { data: form } = await supabase
    .from("sponsored_event_fulfilment")
    .select("promo_channels, promo_post_count, promo_start_date, ready_at")
    .eq("sponsored_event_id", eventId)
    .maybeSingle<{
      promo_channels: string[];
      promo_post_count: number | null;
      promo_start_date: string | null;
      ready_at: string | null;
    }>();
  if (!form) redirect(backTo(eventId, "fulfilment_error", "Save the form before marking it ready."));
  if (form.ready_at) redirect(backTo(eventId, "fulfilment_ready"));

  const missing = [
    form.promo_channels.length === 0 && "agreed promotional channels",
    form.promo_post_count == null && "number of agreed posts",
    !form.promo_start_date && "promotion start date",
  ].filter(Boolean);
  if (missing.length) {
    redirect(backTo(eventId, "fulfilment_error", `Fill in ${missing.join(", ")} first.`));
  }

  const ev = await eventFacts(supabase, eventId);
  if (!ev?.artist_profile_id) {
    redirect(backTo(eventId, "fulfilment_error", "This partnership has no artist to send the form to."));
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("sponsored_event_fulfilment")
    .update({ ready_at: now, ready_by: userId, updated_by: userId })
    .eq("sponsored_event_id", eventId);
  if (error) redirect(backTo(eventId, "fulfilment_error", error.message));

  // The codes deadline (0091) now counts from the form being ready: a week,
  // never later than two days before the event in its own zone.
  if (!ev.reward_codes_confirmed_at) {
    const { data: dueAt } = await supabase.rpc("default_codes_due_at", {
      p_from: now,
      p_event_date: ev.event_date,
      p_timezone: ev.timezone ?? "Europe/London",
    });
    if (dueAt) {
      await supabase
        .from("sponsored_events")
        .update({ codes_due_at: dueAt, codes_reminder_sent_at: null, codes_overdue_alert_sent_at: null })
        .eq("id", eventId);
    }
  }

  const variables = { event_name: ev.name ?? "your partnership", reference: ev.reference ?? "" };
  await notify({
    eventKey: "fulfilment.form_ready",
    recipientProfileId: ev.artist_profile_id,
    link: `/dashboard/sponsored/${eventId}#fulfilment`,
    variables,
  });
  await notifyAdmins({
    eventKey: "admin.fulfilment_ready",
    link: `/dashboard/admin/events/sponsored/${eventId}#fulfilment`,
    variables,
  });

  await supabase.rpc("log_admin_action", {
    p_action: "sponsorship.fulfilment_ready",
    p_target_type: "sponsored_event",
    p_target_id: eventId,
    p_detail: {},
  });

  revalidateFulfilment(eventId);
  redirect(backTo(eventId, "fulfilment_ready"));
}
