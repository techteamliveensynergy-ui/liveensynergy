"use client";

import { useActionState } from "react";
import { PendingSubmit } from "@/components/ui/PendingSubmit";
import { createMarketingCampaign, type MarketingState } from "./actions";

export function NewCampaignForm({ brands }: { brands: { id: string; name: string }[] }) {
  const [state, action] = useActionState<MarketingState, FormData>(createMarketingCampaign, {});
  return (
    <form action={action} className="card mb-5 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block text-sm">
        <span className="field-label">From brand</span>
        <select name="brand_id" required defaultValue="" className="select mt-1">
          <option value="" disabled>
            Choose a brand…
          </option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="field-label">Campaign name (team only)</span>
        <input name="name" required maxLength={200} placeholder="e.g. Summer launch — JH Audio" className="input mt-1" />
      </label>
      <PendingSubmit label="New campaign" pendingLabel="Creating…" className="btn btn-primary text-sm" />
      {state.error && (
        <p role="alert" className="text-sm text-[var(--color-accent)] sm:col-span-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
