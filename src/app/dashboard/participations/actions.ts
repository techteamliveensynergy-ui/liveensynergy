"use server";

import { notify } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { uploadPrivateFile } from "@/lib/storage";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");
  return { supabase, userId: user.id };
}

/**
 * notify() reads the recipient's email from their profile — which the
 * sender's own session can't see under RLS when the recipient is someone
 * else (an audience member notifying the event's artist). The server's
 * service client can; without it the in-app notice still lands.
 */
function serviceOpts() {
  const client = createServiceClient();
  return client ? { client } : {};
}

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/** Audience uploads their ticket as a file (photo or PDF), replacing the old paste-a-link step. */
export async function uploadTicketProof(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;

  // Selected, and not yet checked in — the same rule the participations guard
  // (0061) enforces, checked first so the file isn't uploaded for nothing and
  // the attendee gets a clear message rather than a silent no-op.
  const { data: current } = await supabase
    .from("participations")
    .select("selected, status")
    .eq("id", id)
    .eq("audience_profile_id", userId)
    .maybeSingle<{ selected: boolean; status: string }>();
  if (!current?.selected || !["registered", "ticket_uploaded"].includes(current.status)) {
    redirect("/dashboard/participations?notice=upload-not-allowed");
  }

  // A ticket is a photo or a PDF. Anything else (an .exe, a zip) is refused
  // here rather than stored for the artist to open.
  const file = formData.get("ticket_file");
  if (file instanceof File && file.size > 0 && !(file.type.startsWith("image/") || file.type === "application/pdf")) {
    redirect("/dashboard/participations?notice=upload-wrong-type");
  }

  const { path, error } = await uploadPrivateFile(file, "ticket-proof");
  if (error || !path) {
    redirect("/dashboard/participations?notice=upload-failed");
  }

  const { data: uploaded } = await supabase
    .from("participations")
    .update({ ticket_proof_url: path, status: "ticket_uploaded" })
    .eq("id", id)
    .eq("audience_profile_id", userId)
    .select("sponsored_events(id, name, artist_profile_id)")
    .maybeSingle<{ sponsored_events: { id: string; name: string; artist_profile_id: string | null } | null }>();

  // The artist / organiser running the event reviews ticket proofs.
  const ev = uploaded?.sponsored_events;
  if (ev?.artist_profile_id) {
    await notify({
      eventKey: "participant.proof_uploaded",
      recipientProfileId: ev.artist_profile_id,
      link: `/dashboard/sponsored/${ev.id}`,
      variables: { event_name: ev.name },
    }, serviceOpts());
  }

  revalidatePath("/dashboard/participations");
  redirect("/dashboard/participations?notice=upload-success");
}

/**
 * The partner newsletter & promotions tick. It is one choice for every partner
 * brand (0119): ticking turns it on for all the events they are in and the
 * ones they join later. It is only shown while off; switching it off is in the
 * profile. If 0119 isn't applied yet this falls back to the old per-event tick
 * so the screen keeps working.
 */
export async function provideConsent(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;
  const on = formData.get("newsletter_opt_in") ? true : false;

  if (on) {
    const { data, error } = await supabase.rpc("set_partner_marketing_all", { p_on: true });
    if (!error && (data as { ok?: boolean } | null)?.ok) {
      revalidatePath("/dashboard/participations");
      revalidatePath("/dashboard/profile");
      return;
    }
  }

  await supabase
    .from("participations")
    // Newsletter only. bank_details_provided belonged to the cash payout and
    // is left as recorded; the form no longer offers it.
    .update({ newsletter_opt_in: on })
    .eq("id", id)
    .eq("audience_profile_id", userId);

  revalidatePath("/dashboard/participations");
}

/**
 * Withdraws from an event — but only up to the point of being selected.
 *
 * Once someone is in the draw the sponsor has committed part of the budget to
 * them and the organiser is counting on the headcount, so walking away is a
 * conversation with the team rather than a button (10 Aug standup). The
 * `.is("selected", false)` on the delete is the actual rule; hiding the button
 * is only the courtesy.
 */
export async function withdrawParticipation(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase
    .from("participations")
    .delete()
    .eq("id", id)
    .eq("audience_profile_id", userId)
    .is("selected", false);
  revalidatePath("/dashboard/participations");
}

export type LocationCheckInResult = {
  result:
    | "verified"
    | "already"
    | "too_far"
    | "low_accuracy"
    | "invalid_location"
    | "no_venue"
    | "too_early"
    | "too_late"
    | "event_not_live"
    | "not_registered"
    | "not_found"
    | "rate_limited"
    | "signed_out"
    | "error";
  distance_m?: number | null;
  radius_m?: number | null;
  accuracy_m?: number | null;
  max_accuracy_m?: number | null;
  event_date?: string | null;
};

/**
 * In-app check-in (0126): the phone's location goes to check_in_at_location(),
 * which decides — distance to the venue, precision of the reading, the event's
 * own day — and records the attempt. Called directly from <CheckInButton>, not
 * as a form action, because the location is only known in the browser.
 */
export async function checkInWithLocation(
  participationId: string,
  lat: number,
  lng: number,
  accuracy: number,
): Promise<LocationCheckInResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { result: "signed_out" };
  if (!/^[0-9a-f-]{36}$/i.test(String(participationId))) return { result: "not_found" };

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const { data, error } = await supabase.rpc("check_in_at_location", {
    p_participation_id: participationId,
    p_lat: num(lat),
    p_lng: num(lng),
    p_accuracy_m: num(accuracy),
  });
  if (error || !data) {
    console.error("[checkInWithLocation] rpc failed", error?.message);
    return { result: "error" };
  }
  const out = data as LocationCheckInResult & { event_name?: string };

  if (out.result === "verified") {
    await notify({
      eventKey: "participation.verified",
      recipientProfileId: user.id,
      link: "/dashboard/participations",
      variables: { event_name: out.event_name ?? "your event" },
    });
  }
  if (out.result === "verified" || out.result === "already") {
    revalidatePath("/dashboard/participations");
    revalidatePath("/dashboard");
  }
  return {
    result: out.result,
    distance_m: out.distance_m ?? null,
    radius_m: out.radius_m ?? null,
    accuracy_m: out.accuracy_m ?? null,
    max_accuracy_m: out.max_accuracy_m ?? null,
    event_date: out.event_date ?? null,
  };
}
