"use server";

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

  await supabase
    .from("participations")
    .update({ ticket_proof_url: path, status: "ticket_uploaded" })
    .eq("id", id)
    .eq("audience_profile_id", userId);

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
