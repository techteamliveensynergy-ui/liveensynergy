import { campaignSteps, currentStep, type CampaignProgressInput } from "./campaign-progress";
import type { CampaignStatus } from "./types";

/**
 * Where a campaign is, as one badge (feedback FB-00031, 13 Oct).
 *
 * A campaign stores four statuses (awaiting_payment / in_progress / completed
 * / closed). "In progress" covered everything from "nobody matched yet" to
 * "fully running", so within it the badge shows a stage worked out from facts
 * the platform already has — the same checklist brands see
 * (campaignSteps()) — and nobody has to remember to update it:
 *
 *   Awaiting payment → Needs matching → Awaiting artist → Awaiting survey → Live
 *
 * Completed and Closed stay manual admin actions (admin_change_campaign_status,
 * 0066): Completed once the event and reporting are done (optional note),
 * Closed when it stops early (a reason, admin-only).
 */

export type CampaignStageKey =
  | "awaiting_payment"
  | "needs_matching"
  | "awaiting_artist"
  | "awaiting_survey"
  | "live"
  | "completed"
  | "closed";

export interface CampaignStage {
  key: CampaignStageKey;
  label: string;
}

export const CAMPAIGN_STAGE_LABELS: Record<CampaignStageKey, string> = {
  awaiting_payment: "Awaiting payment",
  needs_matching: "Needs matching",
  awaiting_artist: "Awaiting artist",
  awaiting_survey: "Awaiting survey",
  live: "Live",
  completed: "Completed",
  closed: "Closed",
};

/** Badge colours: lavender while unpaid, amber while setting up, green once
 *  live, dark green when completed, grey when closed. */
export const CAMPAIGN_STAGE_STYLES: Record<CampaignStageKey, string> = {
  awaiting_payment: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  needs_matching: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  awaiting_artist: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  awaiting_survey: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  live: "bg-[var(--color-olive)] text-[var(--color-ink)]",
  completed: "bg-[var(--color-olive-deep)] text-white",
  closed: "bg-black/10 text-[var(--color-ink-soft)]",
};

/** The order stages appear in filters and the legend. */
export const CAMPAIGN_STAGE_ORDER: CampaignStageKey[] = [
  "awaiting_payment",
  "needs_matching",
  "awaiting_artist",
  "awaiting_survey",
  "live",
  "completed",
  "closed",
];

/** What each badge means and how a campaign gets there — the admin legend. */
export const CAMPAIGN_STAGE_HELP: Record<CampaignStageKey, { meaning: string; how: string }> = {
  awaiting_payment: {
    meaning: "Created from a brand's request; hidden from artists and can't be matched.",
    how: "Automatic. Moves on when the invoice is paid (Stripe or Mark paid) or payment is waived with a reason.",
  },
  needs_matching: {
    meaning: "Paid and open to artists; no event agreed yet.",
    how: "Automatic, until a proposed event is agreed by the brand and the artist.",
  },
  awaiting_artist: {
    meaning: "An event is agreed; the artist still has to set up and confirm the discount codes.",
    how: "Automatic, until the artist confirms the codes on the sponsored event.",
  },
  awaiting_survey: {
    meaning: "Event and codes are in place; no campaign survey is published yet.",
    how: "Automatic, until a survey for this campaign is published.",
  },
  live: {
    meaning: "Paid, matched, codes confirmed and survey published — the campaign is running.",
    how: "Automatic. Stays Live until you mark it Completed.",
  },
  completed: {
    meaning: "Finished — the event took place and reporting is done.",
    how: "Manual: Complete…, with an optional note (admins only). Unagreed proposals are withdrawn.",
  },
  closed: {
    meaning: "Stopped before finishing.",
    how: "Manual: Close…, with a reason (admins only). An unpaid invoice is cancelled and unagreed proposals are withdrawn. Reopen puts it back where it was.",
  },
};

export function campaignStage(input: CampaignProgressInput): CampaignStage {
  const key = stageKey(input);
  return { key, label: CAMPAIGN_STAGE_LABELS[key] };
}

function stageKey(input: CampaignProgressInput): CampaignStageKey {
  if (input.status === "completed") return "completed";
  if (input.status === "closed") return "closed";
  if (input.status === "awaiting_payment") return "awaiting_payment";
  const current = currentStep(campaignSteps(input));
  switch (current?.key) {
    case "payment":
      return "awaiting_payment";
    case "match":
      return "needs_matching";
    case "codes":
      return "awaiting_artist";
    case "survey":
      return "awaiting_survey";
    default:
      return "live";
  }
}

/** Readable stored-status names, for notifications and history. */
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  awaiting_payment: "Awaiting payment",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Closed",
};

/** Why a campaign was closed — admin-only (client decision, 13 Oct). Keep in
 *  step with the check constraint on campaign_status_events (0066). */
export const CAMPAIGN_CLOSE_REASONS = [
  { value: "brand_cancelled", label: "Brand cancelled" },
  { value: "payment_not_received", label: "Payment not received" },
  { value: "no_suitable_artist", label: "No suitable artist or event found" },
  { value: "duplicate_or_test", label: "Duplicate or test campaign" },
  { value: "other", label: "Other (say why in the note)" },
] as const;

export function closeReasonLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CAMPAIGN_CLOSE_REASONS.find((r) => r.value === value)?.label ?? value;
}
