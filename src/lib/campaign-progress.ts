import { formatDate } from "./format";
import type { CampaignStatus } from "./types";

/**
 * Where a brand's campaign is, as a short checklist (13 Oct client notes: a
 * live campaign used to say only "awaiting payment" next to a "Contact"
 * button; the client wants it to say what is actually next, e.g. the artist
 * configuring discount codes and the campaign survey being published).
 *
 * Steps are independent facts, not a strict pipeline — a pre-event survey can
 * be published before an artist is matched — so each is done or not on its
 * own, and the "current" step is simply the first one not yet done.
 */

export type CampaignStepKey = "payment" | "match" | "codes" | "survey" | "open" | "live";

export interface CampaignStep {
  key: CampaignStepKey;
  label: string;
  done: boolean;
  /** What's happening now / who acts — shown on the current step only. */
  detail: string;
}

export interface CampaignProgressInput {
  status: CampaignStatus;
  /** The agreed sponsorship (confirmed/completed), if any. */
  settled: { reward_codes_confirmed_at: string | null } | null;
  /** Proposals put to the brand/artist that nobody has settled yet. */
  openProposals: number;
  /** At least one of the campaign's surveys is published. */
  surveyPublished: boolean;
  /** campaigns.opens_at (0070): when registration and the survey open to the
   *  audience. Null = not opened yet; in the future = scheduled. */
  opensAt: string | null;
}

/** Registration and the survey are open to the audience right now. */
export function isCampaignOpen(opensAt: string | null, now: Date = new Date()): boolean {
  return !!opensAt && new Date(opensAt).getTime() <= now.getTime();
}

export function campaignSteps(c: CampaignProgressInput): CampaignStep[] {
  const paid = c.status !== "awaiting_payment";
  const matched = c.settled != null;
  const codes = !!c.settled?.reward_codes_confirmed_at;
  const steps: CampaignStep[] = [
    {
      key: "payment",
      label: "Invoice paid",
      done: paid,
      detail: "Your campaign opens to artists once its invoice is paid.",
    },
    {
      key: "match",
      label: "Artist matched",
      done: matched,
      detail:
        c.openProposals > 0
          ? `${c.openProposals} proposed event${c.openProposals === 1 ? "" : "s"} waiting to be agreed.`
          : "Our team is lining up the right artist or event for your campaign.",
    },
    {
      key: "codes",
      label: "Artist sets up discount codes",
      done: codes,
      detail: "The artist is configuring and confirming the discount codes attendees will receive.",
    },
    {
      key: "survey",
      label: "Campaign survey published",
      done: c.surveyPublished,
      detail: "Our team is publishing the campaign survey.",
    },
    {
      // 14 Oct standup: a paid, agreed event shows to the audience as
      // "Upcoming" straight away, but registration and the survey open only
      // when the team says so — timed to the event's promotion.
      key: "open",
      label: "Registrations open",
      done: isCampaignOpen(c.opensAt),
      detail: c.opensAt
        ? `Registration and the survey open ${formatDate(c.opensAt)}. Until then the event shows to the audience as upcoming.`
        : "The event already shows to the audience as upcoming. Our team opens registration and the survey to coincide with its promotion.",
    },
  ];
  const allDone = steps.every((s) => s.done);
  steps.push({
    key: "live",
    label: "Campaign live",
    done: allDone,
    detail: "Everything is in place — follow participants and results from the sponsored event.",
  });
  return steps;
}

/** The first step not done yet, or null once the campaign is fully live. */
export function currentStep(steps: CampaignStep[]): CampaignStep | null {
  return steps.find((s) => !s.done) ?? null;
}
