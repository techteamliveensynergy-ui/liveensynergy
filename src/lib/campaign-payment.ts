import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications";

/**
 * Tells a brand its campaign has opened to artists — after its invoice was
 * paid, or after an admin waived payment. Shared by both paths. Never throws
 * (notify() doesn't), so a notification problem can't undo the payment.
 */
export async function notifyCampaignOpened(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<void> {
  const { data } = await supabase
    .from("campaigns")
    .select("reference, brands(profile_id)")
    .eq("id", campaignId)
    .maybeSingle<{ reference: string; brands: { profile_id: string } | null }>();
  if (!data?.brands?.profile_id) return;

  await notify({
    eventKey: "campaign.opened",
    recipientProfileId: data.brands.profile_id,
    link: "/dashboard/campaigns",
    variables: { campaign_reference: data.reference },
  });
}
