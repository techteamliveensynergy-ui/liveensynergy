"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { ARTIST_CATEGORIES, computePlatformFee } from "@/lib/constants";
import type { Campaign } from "@/lib/types";
import {
  createCampaign,
  updateCampaign,
  type CampaignState,
} from "./actions";
import { useState } from "react";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function CampaignForm({ campaign }: { campaign?: Campaign }) {
  const editing = Boolean(campaign);
  const action = editing ? updateCampaign : createCampaign;
  const [state, formAction] = useActionState<CampaignState, FormData>(
    action,
    {},
  );
  const d = campaign;
  const [budget, setBudget] = useState<number>(d?.budget_gbp ?? 0);
  const fee = budget > 0 ? computePlatformFee(budget) : null;

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={campaign!.id} />}
      <ErrorBanner error={state.error} />

      <FormSection title="Campaign proposal">
        <Field
          label="Campaign description"
          htmlFor="description"
          required
          hint="A brief objective for this campaign (up to ~50 words)."
        >
          <textarea
            id="description"
            name="description"
            className="textarea"
            required
            defaultValue={d?.description ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sponsorship budget (GBP)" htmlFor="budget_gbp" required>
            <input
              id="budget_gbp"
              name="budget_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              required
              defaultValue={d?.budget_gbp ?? ""}
              onChange={(e) => setBudget(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Category of artist / event" htmlFor="category">
            <select
              id="category"
              name="category"
              className="select"
              defaultValue={d?.category ?? ""}
            >
              <option value="">Select…</option>
              {ARTIST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {fee && (
          <div className="rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
            <p className="font-semibold">Estimated breakdown</p>
            <p className="text-[var(--color-ink-soft)]">
              Service fee {fmt(fee.feeIncVat)} inc. VAT · available for
              sponsorship{" "}
              <span className="font-semibold text-[var(--color-brand-dark)]">
                {fmt(fee.availableForSponsorship)}
              </span>
            </p>
          </div>
        )}

        <Field label="If 'Other' category, specify" htmlFor="category_other">
          <input
            id="category_other"
            name="category_other"
            className="input"
            defaultValue={d?.category_other ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred event location" htmlFor="preferred_location">
            <input
              id="preferred_location"
              name="preferred_location"
              className="input"
              placeholder="City, Country"
              defaultValue={d?.preferred_location ?? ""}
            />
          </Field>
          <Field label="Preferred event timeline" htmlFor="preferred_timeline">
            <input
              id="preferred_timeline"
              name="preferred_timeline"
              className="input"
              placeholder="Month, Year"
              defaultValue={d?.preferred_timeline ?? ""}
            />
          </Field>
        </div>

        <Field
          label="Name of event / artist (if known)"
          htmlFor="target_name"
        >
          <input
            id="target_name"
            name="target_name"
            className="input"
            defaultValue={d?.target_name ?? ""}
          />
        </Field>

        <Field
          label="Preferred reward rules"
          htmlFor="reward_rules"
          hint="e.g. first 20 sign-ups, random 50 people, a particular institution or postcode (up to ~200 words)."
        >
          <textarea
            id="reward_rules"
            name="reward_rules"
            className="textarea"
            defaultValue={d?.reward_rules ?? ""}
          />
        </Field>

        <Field label="Any further information" htmlFor="additional_info">
          <textarea
            id="additional_info"
            name="additional_info"
            className="textarea"
            defaultValue={d?.additional_info ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection title="Campaign manager">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manager's name" htmlFor="manager_name">
            <input
              id="manager_name"
              name="manager_name"
              className="input"
              defaultValue={d?.manager_name ?? ""}
            />
          </Field>
          <Field label="Manager's email" htmlFor="manager_email">
            <input
              id="manager_email"
              name="manager_email"
              type="email"
              className="input"
              defaultValue={d?.manager_email ?? ""}
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save changes" : "Submit request"} />
      </div>
    </form>
  );
}

function fmt(n: number) {
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}
