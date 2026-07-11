"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import {
  createSponsoredEvent,
  type SponsoredState,
} from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Creating…" : "Create sponsored event"}
    </button>
  );
}

export function SponsoredEventForm({
  listings,
  campaigns,
}: {
  listings: { id: string; name: string }[];
  campaigns: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<SponsoredState, FormData>(
    createSponsoredEvent,
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      <ErrorBanner error={state.error} />

      <FormSection
        title="Link the match"
        description="Optionally link a listed event (auto-links the artist) and one of your campaigns."
      >
        <Field label="Linked event listing" htmlFor="listing_id">
          <select id="listing_id" name="listing_id" className="select" defaultValue="">
            <option value="">None</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Linked campaign" htmlFor="campaign_id">
          <select id="campaign_id" name="campaign_id" className="select" defaultValue="">
            <option value="">None</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title="Event details">
        <Field label="Event name" htmlFor="name" required>
          <input id="name" name="name" className="input" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event date" htmlFor="event_date">
            <input id="event_date" name="event_date" type="date" className="input" />
          </Field>
          <Field label="Participation deadline" htmlFor="participation_deadline">
            <input
              id="participation_deadline"
              name="participation_deadline"
              type="date"
              className="input"
            />
          </Field>
        </div>
        <Field label="Venue details" htmlFor="venue_details">
          <input id="venue_details" name="venue_details" className="input" />
        </Field>
        <Field label="Location" htmlFor="location">
          <input
            id="location"
            name="location"
            className="input"
            placeholder="City, Country"
          />
        </Field>
      </FormSection>

      <FormSection title="Sponsorship">
        <Field label="Budget (GBP)" htmlFor="budget_gbp">
          <input
            id="budget_gbp"
            name="budget_gbp"
            type="number"
            min={0}
            step="0.01"
            className="input"
          />
        </Field>
        <Field
          label="Reward rules"
          htmlFor="reward_rules"
          hint="e.g. first 50 sign-ups get a full ticket refund"
        >
          <textarea id="reward_rules" name="reward_rules" className="textarea" />
        </Field>
        <Field label="Sponsorship terms" htmlFor="terms">
          <textarea id="terms" name="terms" className="textarea" />
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
