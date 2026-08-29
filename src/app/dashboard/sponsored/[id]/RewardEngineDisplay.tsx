import type { SponsoredEventRewardTier } from "@/lib/types";

export function RewardEngineDisplay({
  tiers,
}: {
  tiers: SponsoredEventRewardTier[];
}) {
  if (tiers.length === 0) return null;

  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold">Reward engine</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        How rewards are tiered for this sponsorship, by order of registration.
      </p>
      <div className="mt-4 space-y-2">
        {tiers.map((t) => (
          <div
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm"
          >
            <span className="font-medium">{t.label}</span>
            <span className="text-[var(--color-ink-soft)]">
              {t.value_label ?? (t.code_type === "merch" ? "Merch" : "Discount")}
              {t.participant_cap != null ? ` · up to ${t.participant_cap}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
