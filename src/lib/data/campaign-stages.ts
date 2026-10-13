import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignStage, type CampaignStage } from "@/lib/campaign-stage";
import type { CampaignStatus } from "@/lib/types";

/**
 * Stage badges for a short list of campaigns (brand home, admin overview) —
 * loads the two facts campaignStage() needs beyond the stored status: the
 * campaign's sponsored events and whether a survey is published. An admin
 * reads survey_templates directly; a brand has no read policy on it, so it
 * asks campaign_party_surveys() (0060) per open campaign — keep the list short.
 */
export async function campaignStagesFor(
  supabase: SupabaseClient,
  campaigns: { id: string; status: CampaignStatus }[],
  viewer: "admin" | "brand",
): Promise<Map<string, CampaignStage>> {
  const ids = campaigns.map((c) => c.id);
  if (ids.length === 0) return new Map();
  // Only an open campaign's stage depends on these facts.
  const open = campaigns.filter((c) => c.status === "in_progress");

  const [{ data: eventRows }, published] = await Promise.all([
    supabase
      .from("sponsored_events")
      .select("campaign_id, status, reward_codes_confirmed_at")
      .in("campaign_id", ids),
    viewer === "admin"
      ? supabase
          .from("survey_templates")
          .select("campaign_id")
          .eq("status", "published")
          .in("campaign_id", ids)
          .then(({ data }) => new Set(((data ?? []) as { campaign_id: string }[]).map((t) => t.campaign_id)))
      : Promise.all(
          open.map(async (c) => {
            const { data } = await supabase.rpc("campaign_party_surveys", { p_campaign_id: c.id });
            return ((data ?? []) as { status: string }[]).some((s) => s.status === "published") ? c.id : null;
          }),
        ).then((list) => new Set(list.filter((x): x is string => !!x))),
  ]);

  const events = (eventRows ?? []) as {
    campaign_id: string;
    status: string;
    reward_codes_confirmed_at: string | null;
  }[];

  return new Map(
    campaigns.map((c) => {
      const mine = events.filter((e) => e.campaign_id === c.id);
      return [
        c.id,
        campaignStage({
          status: c.status,
          settled: mine.find((e) => e.status === "confirmed" || e.status === "completed") ?? null,
          openProposals: mine.filter((e) => e.status === "in_progress").length,
          surveyPublished: published.has(c.id),
        }),
      ];
    }),
  );
}
