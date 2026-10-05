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

  const { path, error } = await uploadPrivateFile(
    formData.get("ticket_file"),
    "ticket-proof",
  );
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

/** Audience records consent and that they've supplied payout details. */
export async function provideConsent(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;

  await supabase
    .from("participations")
    .update({
      newsletter_opt_in: formData.get("newsletter_opt_in") ? true : false,
      bank_details_provided: formData.get("bank_details_provided")
        ? true
        : false,
    })
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
