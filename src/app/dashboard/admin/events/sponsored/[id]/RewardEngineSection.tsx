"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { RewardCode, SponsoredEventRewardTier } from "@/lib/types";
import {
  upsertRewardTiers,
  type MarketplaceState,
} from "../../../marketplace-actions";

function SaveTiers() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
      {pending ? "Saving…" : "Save tiers"}
    </button>
  );
}

interface DraftTier {
  key: string;
  label: string;
  participant_cap: string;
  code_type: string;
  value_label: string;
}

export function RewardEngineSection({
  eventId,
  tiers,
  codes,
}: {
  eventId: string;
  tiers: SponsoredEventRewardTier[];
  codes: RewardCode[];
}) {
  const [state, formAction] = useActionState<MarketplaceState, FormData>(
    upsertRewardTiers,
    {},
  );
  const [draft, setDraft] = useState<DraftTier[]>(
    tiers.length > 0
      ? tiers.map((t) => ({
          key: t.id,
          label: t.label,
          participant_cap: t.participant_cap != null ? String(t.participant_cap) : "",
          code_type: t.code_type ?? "discount",
          value_label: t.value_label ?? "",
        }))
      : [
          { key: "0", label: "First 50 participants", participant_cap: "50", code_type: "discount", value_label: "Ticket subsidy" },
          { key: "1", label: "Everyone after", participant_cap: "", code_type: "discount", value_label: "Discount code" },
        ],
  );

  const issued = codes.length;
  const redeemed = codes.filter((c) => c.status === "redeemed").length;

  return (
    <div className="card p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
        Reward engine
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Tiers by order of registration — the first tier's cap is who gets the
        best reward. {issued} code{issued === 1 ? "" : "s"} issued, {redeemed} redeemed.
      </p>

      {state.error && (
        <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="event_id" value={eventId} />
        {draft.map((tier, i) => (
          <div
            key={tier.key}
            className="grid gap-2 rounded-xl border border-black/10 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
          >
            <input
              name="tier_label"
              className="input py-1.5 text-sm"
              placeholder="Tier label"
              value={tier.label}
              onChange={(e) => {
                const next = [...draft];
                next[i] = { ...tier, label: e.target.value };
                setDraft(next);
              }}
            />
            <input
              name="tier_cap"
              type="number"
              min={0}
              className="input py-1.5 text-sm"
              placeholder="Cap (blank = rest)"
              value={tier.participant_cap}
              onChange={(e) => {
                const next = [...draft];
                next[i] = { ...tier, participant_cap: e.target.value };
                setDraft(next);
              }}
            />
            <select
              name="tier_code_type"
              className="select py-1.5 text-sm"
              value={tier.code_type}
              onChange={(e) => {
                const next = [...draft];
                next[i] = { ...tier, code_type: e.target.value };
                setDraft(next);
              }}
            >
              <option value="discount">Discount</option>
              <option value="merch">Merch</option>
            </select>
            <input
              name="tier_value_label"
              className="input py-1.5 text-sm"
              placeholder="e.g. 20% off"
              value={tier.value_label}
              onChange={(e) => {
                const next = [...draft];
                next[i] = { ...tier, value_label: e.target.value };
                setDraft(next);
              }}
            />
            <button
              type="button"
              className="btn btn-ghost text-xs text-[var(--color-accent)]"
              onClick={() => setDraft(draft.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            onClick={() =>
              setDraft([
                ...draft,
                {
                  key: String(Date.now()),
                  label: "",
                  participant_cap: "",
                  code_type: "discount",
                  value_label: "",
                },
              ])
            }
          >
            + Add tier
          </button>
          <SaveTiers />
        </div>
      </form>
    </div>
  );
}
