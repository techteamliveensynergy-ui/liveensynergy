import {
  CAMPAIGN_STAGE_HELP,
  CAMPAIGN_STAGE_LABELS,
  CAMPAIGN_STAGE_ORDER,
} from "@/lib/campaign-stage";
import { CampaignStageBadge } from "./CampaignStageBadge";

/**
 * What each campaign badge means and how a campaign gets there — shown at the
 * foot of the admin campaign pages (client request, 13 Oct). Collapsible so it
 * doesn't push the list down once the team knows it.
 */
export function CampaignStatusLegend({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="card mt-8 p-5 text-sm">
      <summary className="cursor-pointer font-semibold text-[var(--color-ink)]">
        What the campaign statuses mean
      </summary>
      <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
        The first five follow the campaign automatically from what has happened (payment, the agreed event,
        the artist&apos;s discount codes, the published survey). Completed and Closed are set by an admin.
        Brands see the same badge; close reasons and notes are visible to admins only.
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {CAMPAIGN_STAGE_ORDER.map((key) => (
          <div key={key} className="rounded-xl bg-[var(--color-mist)] px-4 py-3">
            <dt>
              <CampaignStageBadge stage={{ key, label: CAMPAIGN_STAGE_LABELS[key] }} />
            </dt>
            <dd className="mt-1.5">{CAMPAIGN_STAGE_HELP[key].meaning}</dd>
            <dd className="mt-1 text-xs text-[var(--color-ink-soft)]">{CAMPAIGN_STAGE_HELP[key].how}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-[var(--color-ink-soft)]">
        <strong>Matched</strong> and <strong>Invoice</strong> chips next to the badge show those two facts on
        their own. Agreeing an event no longer closes the campaign — it moves to Awaiting artist.
      </p>
    </details>
  );
}
