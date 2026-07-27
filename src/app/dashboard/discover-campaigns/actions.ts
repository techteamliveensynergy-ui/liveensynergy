"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { notify, notifyAdmins } from "@/lib/notifications";

/**
 * An artist / organiser registers interest in a brand's open campaign.
 *
 * Matching is deliberately mediated by the Live-En-Synergy team rather than
 * opening a direct line to the sponsor, so this notifies the team and
 * acknowledges to the artist that someone will come back within 48 hours.
 */
export async function registerInterest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const campaignId = String(formData.get("campaign_id") ?? "");
  if (!campaignId) redirect("/dashboard/discover-campaigns");

  const { data: campaign } = await supabase
    .from("open_campaigns")
    .select("reference, brand_name")
    .eq("id", campaignId)
    .maybeSingle<{ reference: string; brand_name: string }>();

  if (!campaign) redirect("/dashboard/discover-campaigns");

  // Record it before notifying. Without a stored row the confirmation lived
  // only in the redirect's query string, so it vanished on the next page load
  // and the artist could never tell whether the click had registered.
  const { error: insertError } = await supabase
    .from("campaign_interests")
    .insert({ campaign_id: campaignId, profile_id: user.id });

  // 23505 = already registered. Treat a second click as a no-op rather than
  // notifying the team twice about the same artist and campaign.
  if (insertError) {
    if (insertError.code === "23505") {
      redirect("/dashboard/discover-campaigns?registered=already");
    }
    redirect("/dashboard/discover-campaigns?error=1");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle<{ full_name: string | null }>();

  const variables = {
    user_name: profile?.full_name ?? "An artist",
    campaign_reference: campaign.reference,
    brand_name: campaign.brand_name,
  };

  await notify({
    eventKey: "campaign.interest_registered",
    recipientProfileId: user.id,
    link: "/dashboard/discover-campaigns",
    variables,
  });

  await notifyAdmins({
    eventKey: "admin.campaign_interest",
    link: "/dashboard/admin/campaigns",
    variables,
  });

  revalidatePath("/dashboard/discover-campaigns");
  redirect("/dashboard/discover-campaigns?registered=1");
}
