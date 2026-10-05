import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify, notifyAdmins } from "@/lib/notifications";

/**
 * Tells a brand its campaign has opened to artists — after its invoice was
 * paid, or after an admin waived payment. Shared by both paths. Never throws
 * (notify() doesn't), so a notification problem can't undo the payment.
 * Uses the caller's client throughout, so the webhook (no signed-in user)
 * can pass a service-role client.
 */
export async function notifyCampaignOpened(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<void> {
  const { data } = await supabase
    .from("campaigns")
    .select("reference, budget_gbp, brands(profile_id)")
    .eq("id", campaignId)
    .maybeSingle<{ reference: string; budget_gbp: number | null; brands: { profile_id: string } | null }>();
  if (!data?.brands?.profile_id) return;

  await notify({
    eventKey: "campaign.opened",
    recipientProfileId: data.brands.profile_id,
    link: "/dashboard/campaigns",
    variables: { campaign_reference: data.reference },
  }, { client: supabase }); // the Stripe webhook calls this with a service client

  // Now it's visible to artists, it needs an admin to line up events.
  await notifyAdmins(
    {
      eventKey: "admin.campaign_request",
      link: "/dashboard/admin/campaigns?matched=no",
      variables: {
        campaign_reference: data.reference,
        budget: data.budget_gbp != null ? `£${Number(data.budget_gbp).toLocaleString("en-GB")}` : "not set",
      },
    },
    { client: supabase },
  );
}
