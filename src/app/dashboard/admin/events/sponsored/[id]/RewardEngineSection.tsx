"use client";

import { startTransition, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type {
  RewardCode,
  RewardCodePoolEntry,
  SponsoredEventRewardTier,
} from "@/lib/types";
import {
  brandPrefix,
  describePattern,
  describeTierValue,
  estimateTierCost,
  platformLabel,
  REDEMPTION_PLATFORMS,
  REWARD_ADMIN_MARGIN,
} from "@/lib/discount-codes";
import {
  generatePoolCodes,
  issueRewardCodesToEligible,
  markRewardCodeRedeemed,
  removePoolCode,
  reopenRewardCodes,
  sendRewardCodesForReview,
  uploadPoolCodes,
  upsertRewardTiers,
  voidRewardCode,
  type MarketplaceState,
} from "../../../marketplace-actions";

function Submit({ label, pending: pendingLabel, className = "btn btn-primary text-sm", disabled }: {
  label: string;
  pending: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? pendingLabel : label}
    </button>
  );
}

interface DraftTier {
  key: string;
  id: string;
  label: string;
  participant_cap: string;
  code_type: string;
  value_label: string;
  distribution_model: "shared" | "unique";
  code_prefix: string;
  code_random_length: string;
  shared_code: string;
  discount_percent: string;
  value_gbp: string;
  redemption_platform: string;
  redemption_url: string;
  redemption_instructions: string;
  valid_until: string;
}

const s = (v: unknown) => (v == null ? "" : String(v));

function toDraft(t: SponsoredEventRewardTier): DraftTier {
  return {
    key: t.id,
    id: t.id,
    label: t.label,
    participant_cap: s(t.participant_cap),
    code_type: t.code_type ?? "discount",
    value_label: s(t.value_label),
    distribution_model: t.distribution_model ?? "unique",
    code_prefix: s(t.code_prefix),
    code_random_length: s(t.code_random_length ?? 8),
    shared_code: s(t.shared_code),
    discount_percent: s(t.discount_percent),
    value_gbp: s(t.value_gbp),
    redemption_platform: s(t.redemption_platform),
    redemption_url: s(t.redemption_url),
    redemption_instructions: s(t.redemption_instructions),
    valid_until: s(t.valid_until),
  };
}

function blankTier(label: string, cap: string, prefix: string): DraftTier {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    id: "",
    label,
    participant_cap: cap,
    code_type: "discount",
    value_label: "",
    distribution_model: "unique",
    code_prefix: prefix,
    code_random_length: "8",
    shared_code: "",
    discount_percent: "",
    value_gbp: "",
    redemption_platform: "",
    redemption_url: "",
    redemption_instructions: "",
    valid_until: "",
  };
}

const money = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function RewardEngineSection({
  eventId,
  eventReference,
  tiers,
  codes,
  pool,
  confirmedAt,
  hasArtist,
  brandName,
  ticketPrice,
  participantNames,
}: {
  eventId: string;
  eventReference: string;
  tiers: SponsoredEventRewardTier[];
  codes: RewardCode[];
  pool: RewardCodePoolEntry[];
  confirmedAt: string | null;
  hasArtist: boolean;
  brandName: string | null;
  ticketPrice: number | null;
  participantNames: Record<string, string>;
}) {
  const [state, formAction, saving] = useActionState<MarketplaceState, FormData>(upsertRewardTiers, {});
  const defaultPrefix = brandPrefix(brandName) ?? "";
  const [draft, setDraft] = useState<DraftTier[]>(
    tiers.length > 0
      ? tiers.map(toDraft)
      : [
          blankTier("First 50 participants", "50", defaultPrefix),
          blankTier("Everyone after", "", defaultPrefix),
        ],
  );
  // After a save the server hands back the tiers with real ids; a draft still
  // holding `id: ""` for them would insert duplicates on the next save. Reset
  // the draft whenever the saved tiers change (React's "adjust state on prop
  // change" pattern — no effect, no flash).
  const savedSig = tiers.map((t) => `${t.id}:${t.updated_at}`).join("|");
  const [prevSig, setPrevSig] = useState(savedSig);
  if (savedSig !== prevSig && tiers.length > 0) {
    setPrevSig(savedSig);
    setDraft(tiers.map(toDraft));
  }
  const frozen = !!confirmedAt;

  const live = codes.filter((c) => c.status !== "void");
  const redeemed = codes.filter((c) => c.status === "redeemed").length;
  const tierLabel = new Map(tiers.map((t) => [t.id, t.label]));

  function set<K extends keyof DraftTier>(i: number, k: K, v: DraftTier[K]) {
    const next = [...draft];
    next[i] = { ...next[i], [k]: v };
    setDraft(next);
  }

  return (
    <div id="discount-codes" className="card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Reward engine · discount codes
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Tiers fill in registration order. {live.length} code{live.length === 1 ? "" : "s"} issued,{" "}
            {redeemed} redeemed.
          </p>
        </div>
        <ConsentBadge confirmedAt={confirmedAt} hasArtist={hasArtist} />
      </div>

      {frozen && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-sage)]/50 px-4 py-3 text-sm">
          <span>
            The artist confirmed this setup — it&apos;s locked. Reopening withdraws their consent
            and they&apos;ll need to confirm again.
          </span>
          <form action={reopenRewardCodes}>
            <input type="hidden" name="event_id" value={eventId} />
            <Submit label="Reopen for editing" pending="Reopening…" className="btn btn-ghost text-sm" />
          </form>
        </div>
      )}

      {state.error && (
        <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          {state.error}
        </p>
      )}
      {state.success && !state.error && (
        <p className="mt-3 rounded-lg bg-[var(--color-mint)] px-3 py-2 text-sm">Tiers saved.</p>
      )}

      {/* Submitted through onSubmit rather than `action=` on purpose: React 19
          resets a form's DOM after an action runs, and a controlled <select>
          comes back on its first option while state still shows the old
          choice — so the *next* save quietly sent "unique"/no platform.
          Dispatching by hand skips the reset. */}
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
      >
        <input type="hidden" name="event_id" value={eventId} />
        <fieldset disabled={frozen} className="space-y-3">
          {draft.map((tier, i) => {
            const est = estimateTierCost(
              {
                participant_cap: tier.participant_cap ? Number(tier.participant_cap) : null,
                discount_percent: tier.discount_percent ? Number(tier.discount_percent) : null,
                value_gbp: tier.value_gbp ? Number(tier.value_gbp) : null,
              },
              ticketPrice,
            );
            return (
              <div key={tier.key} className="space-y-3 rounded-xl border border-black/10 p-4" data-testid="reward-tier">
                <input type="hidden" name="tier_id" value={tier.id} />
                <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_1fr_1fr]">
                  <label className="text-sm">
                    <span className="field-label">Tier name</span>
                    <input
                      name="tier_label"
                      className="input py-1.5 text-sm"
                      placeholder="e.g. First 50 participants"
                      value={tier.label}
                      onChange={(e) => set(i, "label", e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="field-label">Pattern</span>
                    <select
                      name="tier_model"
                      className="select py-1.5 text-sm"
                      value={tier.distribution_model}
                      onChange={(e) => set(i, "distribution_model", e.target.value as DraftTier["distribution_model"])}
                    >
                      <option value="unique">C · Unique code per person</option>
                      <option value="shared">A/B · One shared code</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="field-label">
                      {tier.distribution_model === "shared" ? "Max uses" : "Cap"}
                    </span>
                    <input
                      name="tier_cap"
                      type="number"
                      min={1}
                      step={1}
                      className="input py-1.5 text-sm"
                      placeholder="Blank = no cap"
                      value={tier.participant_cap}
                      onChange={(e) => set(i, "participant_cap", e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="field-label">Type</span>
                    <select
                      name="tier_code_type"
                      className="select py-1.5 text-sm"
                      value={tier.code_type}
                      onChange={(e) => set(i, "code_type", e.target.value)}
                    >
                      <option value="discount">Discount</option>
                      <option value="merch">Merchandise</option>
                    </select>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm">
                    <span className="field-label">% off</span>
                    <input
                      name="tier_discount_percent"
                      type="number"
                      min={0.01}
                      max={100}
                      step="0.01"
                      className="input py-1.5 text-sm"
                      placeholder="e.g. 25"
                      value={tier.discount_percent}
                      onChange={(e) => set(i, "discount_percent", e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="field-label">…or £ off</span>
                    <input
                      name="tier_value_gbp"
                      type="number"
                      min={0.01}
                      step="0.01"
                      className="input py-1.5 text-sm"
                      placeholder="e.g. 25"
                      value={tier.value_gbp}
                      onChange={(e) => set(i, "value_gbp", e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="field-label">What participants see</span>
                    <input
                      name="tier_value_label"
                      className="input py-1.5 text-sm"
                      placeholder={describeTierValue({
                        value_label: null,
                        discount_percent: tier.discount_percent ? Number(tier.discount_percent) : null,
                        value_gbp: tier.value_gbp ? Number(tier.value_gbp) : null,
                        code_type: tier.code_type as "discount" | "merch",
                      })}
                      value={tier.value_label}
                      onChange={(e) => set(i, "value_label", e.target.value)}
                    />
                  </label>
                </div>

                {tier.distribution_model === "shared" ? (
                  <label className="block text-sm">
                    <span className="field-label">Shared code (as created on the brand&apos;s platform)</span>
                    <input
                      name="tier_shared_code"
                      className="input py-1.5 font-mono text-sm"
                      placeholder="e.g. LEV20OFF"
                      value={tier.shared_code}
                      onChange={(e) => set(i, "shared_code", e.target.value.trim())}
                    />
                    <input type="hidden" name="tier_prefix" value={tier.code_prefix} />
                    <input type="hidden" name="tier_random_length" value={tier.code_random_length} />
                  </label>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
                    <input type="hidden" name="tier_shared_code" value="" />
                    <label className="text-sm">
                      <span className="field-label">Code prefix</span>
                      <input
                        name="tier_prefix"
                        className="input py-1.5 font-mono text-sm uppercase"
                        placeholder={defaultPrefix || "BRAND"}
                        maxLength={8}
                        value={tier.code_prefix}
                        onChange={(e) =>
                          set(i, "code_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                        }
                      />
                    </label>
                    <label className="text-sm">
                      <span className="field-label">Random characters</span>
                      <input
                        name="tier_random_length"
                        type="number"
                        min={6}
                        max={16}
                        className="input py-1.5 text-sm"
                        value={tier.code_random_length}
                        onChange={(e) => set(i, "code_random_length", e.target.value)}
                      />
                    </label>
                    <p className="field-hint self-end text-xs">
                      Generated codes look like{" "}
                      <span className="font-mono">
                        {(tier.code_prefix || defaultPrefix) && `${tier.code_prefix || defaultPrefix}-`}
                        {"X".repeat(Math.min(16, Math.max(6, Number(tier.code_random_length) || 8)))
                          .match(/.{1,4}/g)!
                          .join("-")}
                      </span>
                      . Or upload the batch you created on the brand&apos;s platform.
                    </p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
                  <label className="text-sm">
                    <span className="field-label">Redeem on</span>
                    <select
                      name="tier_platform"
                      className="select py-1.5 text-sm"
                      value={tier.redemption_platform}
                      onChange={(e) => set(i, "redemption_platform", e.target.value)}
                    >
                      <option value="">Not set</option>
                      {REDEMPTION_PLATFORMS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="field-label">Link to the event / shop page</span>
                    <input
                      name="tier_url"
                      className="input py-1.5 text-sm"
                      placeholder="eventbrite.co.uk/e/…"
                      value={tier.redemption_url}
                      onChange={(e) => set(i, "redemption_url", e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="field-label">Valid until</span>
                    <input
                      name="tier_valid_until"
                      type="date"
                      className="input py-1.5 text-sm"
                      value={tier.valid_until}
                      onChange={(e) => set(i, "valid_until", e.target.value)}
                    />
                  </label>
                </div>

                <label className="block text-sm">
                  <span className="field-label">How to redeem (optional — shown under the code)</span>
                  <textarea
                    name="tier_instructions"
                    rows={2}
                    className="textarea text-sm"
                    placeholder="Leave blank to use the standard instructions for the platform."
                    value={tier.redemption_instructions}
                    onChange={(e) => set(i, "redemption_instructions", e.target.value)}
                  />
                </label>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-ink-soft)]">
                  <span>
                    {est
                      ? `Worst-case discount cost: ${money(est.base)} (${money(est.withMargin)} with ${Math.round(
                          REWARD_ADMIN_MARGIN * 100,
                        )}% admin margin)`
                      : tier.participant_cap
                        ? "Add a value (and a ticket price on the listing, for %) to see the cost."
                        : "Uncapped — no worst-case cost."}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs text-[var(--color-accent)]"
                    onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                  >
                    Remove tier
                  </button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost text-sm"
              onClick={() => setDraft([...draft, blankTier("", "", defaultPrefix)])}
            >
              + Add tier
            </button>
            <button type="submit" className="btn btn-primary text-sm" disabled={frozen || saving}>
              {saving ? "Saving…" : "Save tiers"}
            </button>
          </div>
        </fieldset>
      </form>

      {tiers.length > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="font-semibold">Codes by tier</h3>
          {tiers.map((t) => (
            <TierCodes
              key={t.id}
              eventId={eventId}
              tier={t}
              pool={pool.filter((p) => p.tier_id === t.id)}
              issued={live.filter((c) => c.tier_id === t.id).length}
              frozen={frozen}
            />
          ))}

          <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-4">
            {hasArtist && !frozen && (
              <form action={sendRewardCodesForReview}>
                <input type="hidden" name="event_id" value={eventId} />
                <Submit label="Send to artist for review" pending="Sending…" />
              </form>
            )}
            <a
              className="btn btn-ghost text-sm"
              href={`/dashboard/sponsored/${eventId}/reward-codes`}
              download={`${eventReference}-discount-codes.csv`}
            >
              Download codes (CSV)
            </a>
            <form action={issueRewardCodesToEligible}>
              <input type="hidden" name="event_id" value={eventId} />
              <Submit
                label="Issue codes to everyone eligible"
                pending="Issuing…"
                className="btn btn-dark text-sm"
                disabled={hasArtist && !frozen}
              />
            </form>
            {hasArtist && !frozen && (
              <span className="text-xs text-[var(--color-ink-soft)]">
                Codes can be issued once the artist has confirmed.
              </span>
            )}
          </div>
        </div>
      )}

      {codes.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold">Issued vs redeemed</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-[var(--color-ink-soft)]">
                <tr>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Participant</th>
                  <th className="py-2 pr-3">Tier</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Issued</th>
                  <th className="py-2 pr-3">Redeemed</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {codes.map((c) => (
                  <tr key={c.id} className="border-t border-black/5" data-testid="issued-code-row">
                    <td className="py-2 pr-3 font-mono">
                      {c.code}
                      {c.is_shared && <span className="chip ml-1 text-[10px]">shared</span>}
                    </td>
                    <td className="py-2 pr-3">
                      {(c.participation_id && participantNames[c.participation_id]) || "—"}
                    </td>
                    <td className="py-2 pr-3">{(c.tier_id && tierLabel.get(c.tier_id)) || "—"}</td>
                    <td className="py-2 pr-3 capitalize">{c.status}</td>
                    <td className="py-2 pr-3">{new Date(c.issued_at).toLocaleDateString("en-GB")}</td>
                    <td className="py-2 pr-3">
                      {c.redeemed_at ? new Date(c.redeemed_at).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="py-2">
                      {c.status === "issued" && (
                        <div className="flex gap-1">
                          <form action={markRewardCodeRedeemed}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="event_id" value={eventId} />
                            <Submit label="Mark redeemed" pending="…" className="btn btn-ghost text-xs" />
                          </form>
                          <form action={voidRewardCode}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="event_id" value={eventId} />
                            <Submit
                              label="Void"
                              pending="…"
                              className="btn btn-ghost text-xs text-[var(--color-accent)]"
                            />
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsentBadge({ confirmedAt, hasArtist }: { confirmedAt: string | null; hasArtist: boolean }) {
  if (!hasArtist) return <span className="chip text-xs">No artist attached</span>;
  return confirmedAt ? (
    <span className="chip bg-[var(--color-sage)] text-xs" data-testid="codes-consent">
      Artist confirmed {new Date(confirmedAt).toLocaleDateString("en-GB")}
    </span>
  ) : (
    <span className="chip bg-[var(--color-gold)] text-xs" data-testid="codes-consent">
      Awaiting artist confirmation
    </span>
  );
}

function TierCodes({
  eventId,
  tier,
  pool,
  issued,
  frozen,
}: {
  eventId: string;
  tier: SponsoredEventRewardTier;
  pool: RewardCodePoolEntry[];
  issued: number;
  frozen: boolean;
}) {
  const [genState, genAction] = useActionState<MarketplaceState, FormData>(generatePoolCodes, {});
  const [upState, upAction] = useActionState<MarketplaceState, FormData>(uploadPoolCodes, {});
  const available = pool.filter((p) => !p.assigned_at).length;

  return (
    <div className="rounded-xl border border-black/10 p-4" data-testid="tier-codes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{tier.label}</p>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {describePattern(tier)} · {describeTierValue(tier)}
            {tier.redemption_platform ? ` · redeem on ${platformLabel(tier.redemption_platform)}` : ""}
          </p>
        </div>
        <p className="text-sm" data-testid="tier-code-counts">
          {tier.distribution_model === "shared"
            ? `${issued}${tier.participant_cap != null ? ` / ${tier.participant_cap}` : ""} issued`
            : `${available} available · ${pool.length - available} assigned`}
        </p>
      </div>

      {tier.distribution_model === "shared" ? (
        <p className="mt-2 text-sm">
          Code:{" "}
          {tier.shared_code ? (
            <span className="font-mono">{tier.shared_code}</span>
          ) : (
            <span className="text-[var(--color-accent)]">not set — add it above and save</span>
          )}
        </p>
      ) : (
        <>
          {!frozen && (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <form action={genAction} className="space-y-2">
                <input type="hidden" name="event_id" value={eventId} />
                <input type="hidden" name="tier_id" value={tier.id} />
                <span className="field-label">Generate a batch for the artist to load</span>
                <div className="flex gap-2">
                  <input
                    name="count"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={tier.participant_cap ?? 50}
                    className="input w-[7rem] py-1.5 text-sm"
                    aria-label="How many codes"
                  />
                  <Submit label="Generate" pending="Generating…" className="btn btn-ghost text-sm" />
                </div>
                {genState.error && <p className="text-xs text-[var(--color-accent)]">{genState.error}</p>}
              </form>
              <form action={upAction} className="space-y-2">
                <input type="hidden" name="event_id" value={eventId} />
                <input type="hidden" name="tier_id" value={tier.id} />
                <span className="field-label">…or upload codes created on the brand&apos;s platform</span>
                <textarea
                  name="codes"
                  rows={3}
                  className="textarea font-mono text-xs"
                  placeholder={"One per line, optionally with an ID:\nNIKE-7KQ2-M9XP\nNIKE-3HTR-W4ZD, 10023"}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <input name="codes_file" type="file" accept=".csv,.txt,text/csv,text/plain" className="text-xs" />
                  <Submit label="Add codes" pending="Adding…" className="btn btn-ghost text-sm" />
                </div>
                {upState.error && <p className="text-xs text-[var(--color-accent)]">{upState.error}</p>}
              </form>
            </div>
          )}
          {pool.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--color-ink-soft)]">
                Show {pool.length} code{pool.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 grid max-h-64 gap-1 overflow-y-auto text-xs sm:grid-cols-2">
                {pool.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded bg-black/[0.03] px-2 py-1">
                    <span className="font-mono">
                      {p.code}
                      {p.external_ref && <span className="ml-1 text-[var(--color-ink-soft)]">#{p.external_ref}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-[var(--color-ink-soft)]">
                        {p.assigned_at ? "assigned" : p.source}
                      </span>
                      {!p.assigned_at && !frozen && (
                        <form action={removePoolCode}>
                          <input type="hidden" name="event_id" value={eventId} />
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="text-[var(--color-accent)]" aria-label={`Remove ${p.code}`}>
                            ×
                          </button>
                        </form>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
