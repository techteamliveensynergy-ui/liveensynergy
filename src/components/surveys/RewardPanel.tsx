"use client";

import { useState } from "react";
import { REWARD_PENDING_COPY, type SurveyRewardOutcome } from "@/lib/survey-reward";

/** The discount code on screen (or, plainly, why it isn't there yet). */
export function RewardPanel({ reward }: { reward: SurveyRewardOutcome }) {
  const [copied, setCopied] = useState(false);

  if (reward.status === "pending") {
    const copy = REWARD_PENDING_COPY[reward.reason];
    return (
      <div
        role="status"
        data-testid="reward-pending"
        data-reason={reward.reason}
        className="rounded-xl bg-[var(--color-mist)] px-4 py-3 text-left text-sm"
      >
        <p className="font-semibold text-[var(--color-ink)]">{copy.title}</p>
        <p className="mt-1 text-[var(--color-ink-soft)]">{copy.body}</p>
      </div>
    );
  }

  const expires = reward.expiresAt
    ? new Date(reward.expiresAt).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "Europe/London" })
    : null;

  return (
    <div
      data-testid="reward-issued"
      className="rounded-2xl border border-[var(--color-olive-deep)]/30 bg-[var(--color-sage)]/50 px-4 py-4 text-left"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-olive-deep)]">
        Your discount code{reward.valueLabel ? ` · ${reward.valueLabel}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <code
          data-testid="reward-code"
          className="select-all rounded-lg bg-white px-3 py-2 font-mono text-lg font-semibold tracking-wider text-[var(--color-ink)]"
        >
          {reward.code}
        </code>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(reward.code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard blocked: the code is selectable on screen anyway.
            }
          }}
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      {reward.instructions && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{reward.instructions}</p>
      )}
      {reward.url && (
        <p className="mt-2 text-sm">
          <a href={reward.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Where to use it ↗
          </a>
        </p>
      )}
      <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
        {expires ? `Valid until ${expires}. ` : ""}
        We&apos;ve also emailed it to you, and you can find it any time under My rewards.
      </p>
    </div>
  );
}
