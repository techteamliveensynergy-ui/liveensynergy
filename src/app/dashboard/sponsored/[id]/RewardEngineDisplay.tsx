"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type {
  RewardCode,
  RewardCodePoolEntry,
  SponsoredEventRewardTier,
} from "@/lib/types";
import {
  describePattern,
  describeTierValue,
  estimateTierCost,
  platformLabel,
  REWARD_ADMIN_MARGIN,
} from "@/lib/discount-codes";
import {
  artistRemovePoolCode,
  artistUploadPoolCodes,
  confirmRewardCodes,
  type DiscountCodeState,
} from "../actions";

function Submit({ label, pending, className = "btn btn-primary text-sm" }: {
  label: string;
  pending: string;
  className?: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={busy}>
      {busy ? pending : label}
    </button>
  );
}

const money = (n: number) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * The brand and the artist both see how rewards are tiered; the artist — who
 * absorbs the discount — also reviews the codes, can add their own to a
 * unique-code tier, and gives the consent that freezes the setup
 * (25 Sep standup). Codes are downloadable as CSV for loading into the
 * ticketing platform.
 */
export function RewardEngineDisplay({
  eventId,
  eventReference,
  tiers,
  pool,
  codes,
  isArtist,
  confirmedAt,
  ticketPrice,
  viewerId,
}: {
  eventId: string;
  eventReference: string;
  tiers: SponsoredEventRewardTier[];
  pool: RewardCodePoolEntry[];
  codes: RewardCode[];
  isArtist: boolean;
  confirmedAt: string | null;
  ticketPrice: number | null;
  viewerId: string;
}) {
  const [consentState, consentAction] = useActionState<DiscountCodeState, FormData>(
    confirmRewardCodes,
    {},
  );
  if (tiers.length === 0) return null;
  const frozen = !!confirmedAt;

  return (
    <div id="discount-codes" className="card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Reward engine · discount codes</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            How rewards are tiered for this sponsorship, by order of registration. Participants
            redeem their code on the platform shown.
          </p>
        </div>
        <span
          className={`chip text-xs ${frozen ? "bg-[var(--color-sage)]" : "bg-[var(--color-gold)]"}`}
          data-testid="codes-consent"
        >
          {frozen
            ? `Confirmed by the artist ${new Date(confirmedAt!).toLocaleDateString("en-GB")}`
            : "Awaiting the artist's confirmation"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {tiers.map((t) => {
          const tierPool = pool.filter((p) => p.tier_id === t.id);
          const tierCodes = codes.filter((c) => c.tier_id === t.id && c.status !== "void");
          const redeemed = tierCodes.filter((c) => c.status === "redeemed").length;
          const est = estimateTierCost(t, ticketPrice);
          return (
            <div key={t.id} className="rounded-lg border border-black/10 px-4 py-3 text-sm" data-testid="reward-tier">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t.label}</span>
                <span className="text-[var(--color-ink-soft)]">
                  {describeTierValue(t)}
                  {t.participant_cap != null ? ` · up to ${t.participant_cap}` : ""}
                </span>
              </div>
              <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-[var(--color-ink-soft)] sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium text-[var(--color-ink)]">Pattern: </dt>
                  <dd className="inline">{describePattern(t)}</dd>
                </div>
                {t.redemption_platform && (
                  <div>
                    <dt className="inline font-medium text-[var(--color-ink)]">Redeem on: </dt>
                    <dd className="inline">
                      {platformLabel(t.redemption_platform)}
                      {t.redemption_url && (
                        <>
                          {" · "}
                          <a href={t.redemption_url} target="_blank" rel="noreferrer" className="underline">
                            link
                          </a>
                        </>
                      )}
                    </dd>
                  </div>
                )}
                {t.valid_until && (
                  <div>
                    <dt className="inline font-medium text-[var(--color-ink)]">Valid until: </dt>
                    <dd className="inline">{new Date(t.valid_until).toLocaleDateString("en-GB")}</dd>
                  </div>
                )}
                {t.distribution_model === "shared" && t.shared_code && (
                  <div>
                    <dt className="inline font-medium text-[var(--color-ink)]">Code: </dt>
                    <dd className="inline font-mono">{t.shared_code}</dd>
                  </div>
                )}
                {t.distribution_model === "unique" && (
                  <div>
                    <dt className="inline font-medium text-[var(--color-ink)]">Codes: </dt>
                    <dd className="inline">{tierPool.length} set up</dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-medium text-[var(--color-ink)]">Issued / redeemed: </dt>
                  <dd className="inline">
                    {tierCodes.length} / {redeemed}
                  </dd>
                </div>
                {est && (
                  <div className="sm:col-span-2">
                    <dt className="inline font-medium text-[var(--color-ink)]">Worst-case discount cost: </dt>
                    <dd className="inline">
                      {money(est.base)} ({money(est.withMargin)} incl. {Math.round(REWARD_ADMIN_MARGIN * 100)}%
                      admin margin)
                    </dd>
                  </div>
                )}
              </dl>

              {isArtist && !frozen && t.distribution_model === "unique" && (
                <ArtistCodeUpload
                  eventId={eventId}
                  tierId={t.id}
                  mine={tierPool.filter((p) => p.created_by === viewerId && p.source === "uploaded")}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          className="btn btn-ghost text-sm"
          href={`/dashboard/sponsored/${eventId}/reward-codes`}
          download={`${eventReference}-discount-codes.csv`}
        >
          Download codes (CSV)
        </a>
        <span className="text-xs text-[var(--color-ink-soft)]">
          Load these into your ticketing platform (e.g. Eventbrite&apos;s bulk discount-code upload).
        </span>
      </div>

      {isArtist && !frozen && (
        <form action={consentAction} className="mt-5 rounded-xl bg-[var(--color-mist)] p-4">
          <input type="hidden" name="event_id" value={eventId} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-1" />
            <span>
              I&apos;ve reviewed these discount codes. They&apos;re set up on my ticketing platform (or
              will be before the event), and I agree to honour them for qualifying participants.
            </span>
          </label>
          {consentState.error && (
            <p className="mt-2 text-sm text-[var(--color-accent)]">{consentState.error}</p>
          )}
          <div className="mt-3">
            <Submit label="Confirm discount codes" pending="Confirming…" />
          </div>
        </form>
      )}
      {consentState.message && (
        <p className="mt-3 rounded-lg bg-[var(--color-mint)] px-3 py-2 text-sm">{consentState.message}</p>
      )}
      {isArtist && frozen && (
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Need a change? Message the team — they can reopen the setup, after which you&apos;ll confirm
          it again.
        </p>
      )}
    </div>
  );
}

function ArtistCodeUpload({
  eventId,
  tierId,
  mine,
}: {
  eventId: string;
  tierId: string;
  mine: RewardCodePoolEntry[];
}) {
  const [state, action] = useActionState<DiscountCodeState, FormData>(artistUploadPoolCodes, {});
  return (
    <div className="mt-3 border-t border-black/10 pt-3">
      <form action={action} className="space-y-2">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="tier_id" value={tierId} />
        <span className="field-label">Add your own codes (optional)</span>
        <textarea
          name="codes"
          rows={3}
          className="textarea font-mono text-xs"
          placeholder={"One per line, optionally with your ID number:\nSUMMER-001, 10023\nSUMMER-002, 10024"}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input name="codes_file" type="file" accept=".csv,.txt,text/csv,text/plain" className="text-xs" />
          <Submit label="Add codes" pending="Adding…" className="btn btn-ghost text-sm" />
        </div>
        {state.error && <p className="text-xs text-[var(--color-accent)]">{state.error}</p>}
        {state.message && <p className="text-xs text-[var(--color-olive-deep)]">{state.message}</p>}
      </form>
      {mine.length > 0 && (
        <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto text-xs sm:grid-cols-2">
          {mine.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded bg-black/[0.03] px-2 py-1">
              <span className="font-mono">
                {p.code}
                {p.external_ref && <span className="ml-1 text-[var(--color-ink-soft)]">#{p.external_ref}</span>}
              </span>
              {!p.assigned_at && (
                <form action={artistRemovePoolCode}>
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="text-[var(--color-accent)]" aria-label={`Remove ${p.code}`}>
                    ×
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
