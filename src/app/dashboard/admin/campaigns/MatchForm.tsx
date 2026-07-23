"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ErrorBanner } from "@/components/onboarding/parts";
import { matchCampaign, type MarketplaceState } from "../marketplace-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
      {pending ? "Matching…" : "Match & create sponsorship"}
    </button>
  );
}

/**
 * Links a campaign to an available listing and stands up the sponsored event.
 * This is the manual step the whole marketplace model hinges on.
 */
export function MatchForm({
  campaignId,
  listings,
}: {
  campaignId: string;
  listings: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<MarketplaceState, FormData>(
    matchCampaign,
    {},
  );

  if (listings.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        No available listings to match against right now.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <ErrorBanner error={state.error} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[16rem] flex-1">
          <label className="field-label" htmlFor={`listing-${campaignId}`}>
            Match to an available listing
          </label>
          <select
            id={`listing-${campaignId}`}
            name="listing_id"
            className="select"
            defaultValue=""
          >
            <option value="">Select a listing…</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <Submit />
      </div>
    </form>
  );
}
