"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notifications";

/**
 * Self-service attendance confirmation — the audience member scans the QR
 * code (or follows the link) the artist displays at the venue and confirms
 * it's them, in place of the organiser having to verify each attendee by hand.
 *
 * The check itself lives in `confirm_attendance()` (0061, 0123, 0126): it
 * compares the scanned token with the participation's own event and only
 * opens on the event's own day (in its time zone). It no longer asks for
 * `selected` — selection was retired on 7 Nov (0126). The QR is the fallback
 * for the in-app location check-in on My events, so it needs no location: the
 * code being at the venue is the proof. Before 0061 this action updated
 * whatever participation id the form posted, so check-in worked from home and
 * for any event. A direct update is now refused by the participations guard.
 */
export async function confirmAttendance(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const token = String(formData.get("token") ?? "");
  if (!user) redirect(`/auth/sign-in?redirectTo=/attend/${token}`);
  if (!token) redirect("/dashboard");

  const participationId = String(formData.get("participation_id") ?? "");
  if (!participationId) redirect(`/attend/${token}`);

  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const { data, error } = await supabase.rpc("confirm_attendance", {
    p_token: token,
    p_participation_id: participationId,
    p_lat: num("lat"),
    p_lng: num("lng"),
    p_accuracy: num("accuracy"),
  });
  const result =
    error || !data ? "error" : String((data as { result?: string }).result ?? "error");
  if (error) console.error("[confirmAttendance] rpc failed", error.message);

  if (result === "verified") {
    const eventName = (data as { event_name?: string }).event_name ?? "your event";
    await notify({
      eventKey: "participation.verified",
      recipientProfileId: user.id,
      link: "/dashboard/participations",
      variables: { event_name: eventName },
    });
  }

  // Without this the redirect below re-serves the cached "Confirm you're here"
  // screen, so the attendee sees no acknowledgement that the tap registered.
  revalidatePath(`/attend/${token}`);
  revalidatePath("/dashboard/participations");
  redirect(result === "verified" || result === "already" ? `/attend/${token}` : `/attend/${token}?result=${result}`);
}

/**
 * The in-app "Check in" button on My events: no QR code, so the venue must have
 * a location and the person must be within its radius (0127) — nothing else
 * proves they're there.
 */
export async function confirmAttendanceInApp(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const participationId = String(formData.get("participation_id") ?? "");
  if (!user) redirect(`/auth/sign-in?redirectTo=/dashboard/check-in/${participationId}`);
  if (!participationId) redirect("/dashboard/participations");

  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v && Number.isFinite(Number(v)) ? Number(v) : null;
  };
  const { data, error } = await supabase.rpc("confirm_attendance", {
    p_token: null,
    p_participation_id: participationId,
    p_lat: num("lat"),
    p_lng: num("lng"),
    p_accuracy: num("accuracy"),
  });
  const result = error || !data ? "error" : String((data as { result?: string }).result ?? "error");
  if (error) console.error("[confirmAttendanceInApp] rpc failed", error.message);

  if (result === "verified") {
    await notify({
      eventKey: "participation.verified",
      recipientProfileId: user.id,
      link: "/dashboard/participations",
      variables: { event_name: (data as { event_name?: string }).event_name ?? "your event" },
    });
  }
  revalidatePath(`/dashboard/check-in/${participationId}`);
  revalidatePath("/dashboard/participations");
  redirect(
    result === "verified" || result === "already"
      ? `/dashboard/check-in/${participationId}`
      : `/dashboard/check-in/${participationId}?result=${result}`,
  );
}
