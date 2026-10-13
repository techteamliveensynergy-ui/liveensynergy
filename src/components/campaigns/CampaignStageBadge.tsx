import { CAMPAIGN_STAGE_STYLES, type CampaignStage } from "@/lib/campaign-stage";

/** A campaign's stage (campaignStage()) as a badge — see the legend at the
 *  foot of the admin campaign pages for what each one means. */
export function CampaignStageBadge({ stage }: { stage: CampaignStage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CAMPAIGN_STAGE_STYLES[stage.key]}`}
    >
      {stage.label}
    </span>
  );
}
