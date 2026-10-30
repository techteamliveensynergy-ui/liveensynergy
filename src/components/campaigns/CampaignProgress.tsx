import Link from "next/link";
import { formatDate } from "@/lib/format";
import { campaignSteps, currentStep } from "@/lib/campaign-progress";
import type { Campaign } from "@/lib/types";

export interface CampaignEventRow {
  id: string;
  name: string;
  campaign_id: string | null;
  status: string;
  reward_codes_confirmed_at: string | null;
}

/** The invoice fields the payment step links to. */
export interface CampaignProgressInvoice {
  id: string;
  reference: string;
  due_date: string | null;
}

/**
 * One campaign's "where is it now" checklist on Campaigns live — see
 * campaignSteps() for the steps and why they're independent facts.
 */
export function CampaignProgress({
  campaign: c,
  events,
  surveyPublished,
  invoice,
}: {
  campaign: Campaign;
  events: CampaignEventRow[];
  surveyPublished: boolean;
  invoice: CampaignProgressInvoice | undefined;
}) {
  const settled = events.find((e) => e.status === "confirmed" || e.status === "completed") ?? null;

  // A finished campaign doesn't need a to-do list — just where to look.
  if (c.status === "closed" || c.status === "completed") {
    return (
      <p className="rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
        {c.status === "completed" ? "This campaign has finished." : "This campaign is closed."}{" "}
        {settled && (
          <Link href={`/dashboard/sponsored/${settled.id}`} className="font-semibold text-[var(--color-brand-dark)] underline">
            Results for {settled.name} →
          </Link>
        )}
      </p>
    );
  }

  const openProposals = events.filter((e) => e.status === "in_progress").length;
  const steps = campaignSteps({ status: c.status, settled, openProposals, surveyPublished, opensAt: c.opens_at });
  const current = currentStep(steps);

  return (
    <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
      <ol className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        {steps.map((s) => (
          <li
            key={s.key}
            className={`flex items-center gap-1.5 ${
              s.done
                ? "text-[var(--color-olive-deep)]"
                : s === current
                  ? "font-semibold text-[var(--color-ink)]"
                  : "text-[var(--color-ink-soft)]"
            }`}
          >
            <span aria-hidden>{s.done ? "✓" : s === current ? "●" : "○"}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-[var(--color-ink)]">
        {current ? (
          <>
            <span className="font-semibold">Next: </span>
            {current.detail}{" "}
            {current.key === "payment" &&
              (invoice ? (
                <Link
                  href={`/dashboard/campaigns/invoices/${invoice.id}`}
                  className="font-semibold text-[var(--color-brand-dark)] underline"
                >
                  View invoice {invoice.reference}
                  {invoice.due_date ? ` (due ${formatDate(invoice.due_date)})` : ""}
                </Link>
              ) : (
                "We'll send your invoice shortly."
              ))}
            {current.key === "match" && openProposals > 0 && (
              <Link href="/dashboard/sponsored" className="font-semibold text-[var(--color-brand-dark)] underline">
                Open Partnered events →
              </Link>
            )}
          </>
        ) : (
          <>
            <span className="font-semibold">Your campaign is live.</span>{" "}
          </>
        )}
        {settled && current?.key !== "payment" && current?.key !== "match" && (
          <Link href={`/dashboard/sponsored/${settled.id}`} className="font-semibold text-[var(--color-brand-dark)] underline">
            Open {settled.name} →
          </Link>
        )}
      </p>
      <p className="mt-1.5 text-xs text-[var(--color-ink-soft)]">
        Questions?{" "}
        <Link href="/dashboard/messages?tab=support" className="underline">
          Message the Live·En·Synergy team
        </Link>
      </p>
    </div>
  );
}
