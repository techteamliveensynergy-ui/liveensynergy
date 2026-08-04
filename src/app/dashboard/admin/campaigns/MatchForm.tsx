"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ErrorBanner } from "@/components/onboarding/parts";
import { matchCampaign, type MarketplaceState } from "../marketplace-actions";

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary text-sm"
      disabled={pending || count === 0}
    >
      {pending
        ? "Matching…"
        : count > 1
          ? `Suggest ${count} events`
          : "Suggest event"}
    </button>
  );
}

/**
 * Suggests one or more available listings against a campaign, standing up a
 * sponsored event for each. Several at a time is the point (3 Aug standup):
 * the team puts two or three options in front of the sponsor, and whichever
 * they agree to first closes the campaign and withdraws the others.
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
  const [selected, setSelected] = useState<string[]>([]);

  if (listings.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-soft)]">
        No available listings to match against right now.
      </p>
    );
  }

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <ErrorBanner error={state.error} />

      <div>
        <p className="field-label">Suggest available listings to this sponsor</p>
        <p className="field-hint">
          Tick as many as you want to put forward. The sponsor picks one — the
          rest are withdrawn automatically and their listings go back on the
          market.
        </p>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2">
          {listings.map((l) => (
            <label
              key={l.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--color-mist)]"
            >
              <input
                type="checkbox"
                name="listing_id"
                value={l.id}
                checked={selected.includes(l.id)}
                onChange={() => toggle(l.id)}
                className="mt-0.5 h-4 w-4"
              />
              <span>{l.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Submit count={selected.length} />
      </div>
    </form>
  );
}
