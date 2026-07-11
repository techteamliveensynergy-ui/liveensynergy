"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

/** Audience uploads proof of purchase (a ticket link/reference for the MVP). */
export async function uploadTicketProof(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  const proof = str(formData.get("ticket_proof_url"));
  if (!id || !proof) return;

  await supabase
    .from("participations")
    .update({ ticket_proof_url: proof, status: "ticket_uploaded" })
    .eq("id", id)
    .eq("audience_profile_id", userId);

  revalidatePath("/dashboard/participations");
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

export async function withdrawParticipation(formData: FormData) {
  const { supabase, userId } = await requireUser();
  const id = str(formData.get("id"));
  if (!id) return;
  await supabase
    .from("participations")
    .delete()
    .eq("id", id)
    .eq("audience_profile_id", userId);
  revalidatePath("/dashboard/participations");
}
