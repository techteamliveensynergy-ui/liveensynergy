"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface PartnerMarketingState {
  error?: string;
  message?: string;
}

/**
 * Switches the one "newsletters & promotions from partner brands" choice
 * (0119). On = every event they are in and the ones they join later; off =
 * all of them. The database function does the ticks, the brand subscriptions
 * and the consent log together.
 */
export async function setPartnerMarketing(
  _prev: PartnerMarketingState,
  formData: FormData,
): Promise<PartnerMarketingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const on = formData.get("partner_marketing_all") ? true : false;
  const { data, error } = await supabase.rpc("set_partner_marketing_all", { p_on: on });
  if (error || !(data as { ok?: boolean } | null)?.ok) {
    return { error: "We couldn't save that just now. Please try again in a moment." };
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/participations");
  return {
    message: on
      ? "Saved — you'll hear from our partner brands."
      : "Saved — you won't get newsletters or promotions from our partner brands.",
  };
}
