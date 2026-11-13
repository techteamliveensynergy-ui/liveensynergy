"use client";

import { useActionState } from "react";
import { setPartnerMarketing, type PartnerMarketingState } from "./actions";

/** The one place a person turns partner newsletters & promotions off (or on). */
export function PartnerMarketingCard({ defaultOn }: { defaultOn: boolean }) {
  const [state, action, pending] = useActionState<PartnerMarketingState, FormData>(setPartnerMarketing, {});
  return (
    <form id="partner-marketing" action={action} className="card mb-6 grid gap-3 p-5 text-sm">
      <h2 className="font-semibold text-[var(--color-ink)]">Newsletters &amp; promotions</h2>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="partner_marketing_all" defaultChecked={defaultOn} className="h-4 w-4" />
        Sign me up for newsletters &amp; promotions from all Live·En·Synergy partner brands
      </label>
      <p className="text-xs text-[var(--color-ink-soft)]">
        One choice for every brand whose events you join. Untick it to stop them all. Account emails — sign-in links,
        your discount codes and event updates — always reach you.
      </p>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.message && <p className="text-sm text-[var(--color-ink-soft)]">{state.message}</p>}
      <div>
        <button type="submit" className="btn btn-ghost text-sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
