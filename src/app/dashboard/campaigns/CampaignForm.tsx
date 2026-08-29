"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { FileDrop } from "@/components/ui/FileDrop";
import { UrlInput, URL_HINT } from "@/components/ui/UrlInput";
import { IMAGE_HINT } from "@/lib/upload-limits";
import { ARTIST_CATEGORIES } from "@/lib/constants";
import type { CampaignIntakeRequest } from "@/lib/types";
import {
  submitCampaignIntake,
  updateCampaignIntake,
  type CampaignState,
} from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function CampaignForm({ intake }: { intake?: CampaignIntakeRequest }) {
  const editing = Boolean(intake);
  const action = editing ? updateCampaignIntake : submitCampaignIntake;
  const [state, formAction] = useActionState<CampaignState, FormData>(
    action,
    {},
  );
  const d = intake;

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={intake!.id} />}
      <ErrorBanner error={state.error} />

      {!editing && (
        <section className="card bg-[var(--color-gold)]/35 p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Launch Your Next Partnership
          </h2>
          <p className="mt-2 text-sm text-[var(--color-ink)]/80">
            Submit your campaign details and sponsorship goals. Our team at
            Live·En·Synergy will analyse your brief, put together a package,
            and pair you with the ideal artist or event to bring your vision
            to life — we'll be in touch within 3 days.
          </p>
        </section>
      )}

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
            placeholder="For example: “We want to sponsor a live event that will feature young audiences who love trendy vibes and wear high street fashion.”"
            defaultValue={d?.description ?? ""}
          />
        </Field>

        <Field
          label="Sponsorship budget guidance (GBP)"
          htmlFor="budget_expectation_gbp"
          hint="Optional — a rough figure to work from. Our team will put together a package and confirm the real budget with you."
        >
          <input
            id="budget_expectation_gbp"
            name="budget_expectation_gbp"
            type="number"
            min={0}
            step="0.01"
            className="input"
            defaultValue={d?.budget_expectation_gbp ?? ""}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
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
          <Field label="If 'Other' category, specify" htmlFor="category_other">
            <input
              id="category_other"
              name="category_other"
              className="input"
              defaultValue={d?.category_other ?? ""}
            />
          </Field>
        </div>

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
          label="Campaign image"
          htmlFor="image"
          hint="Optional. If you don't upload one, your brand's profile image is used."
        >
          <FileDrop
            name="image"
            hint={IMAGE_HINT}
            currentUrl={d?.image_url ?? null}
            label="Drag campaign artwork here, or click to browse"
          />
        </Field>

        <Field
          label="Expected outcomes"
          htmlFor="expected_outcomes"
          hint="What you expect to receive in return — branding on creatives, social content, mentions, onsite banners, merch stations, data capture."
        >
          <textarea
            id="expected_outcomes"
            name="expected_outcomes"
            className="textarea"
            placeholder="For example: “Logo on all event creatives, two Instagram posts from the artist, a branded merch stand at the venue.”"
            defaultValue={d?.expected_outcomes ?? ""}
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

      {/* The brief captured what kind of event you're after but never "this
          one, here" — so a sponsor who already had an event in mind had
          nowhere to say so (10 Aug standup). Our team relays it to the
          artist once your request is reviewed. */}
      <FormSection
        title="Know an event already?"
        description="Optional. If there's a specific event — one of ours or one you've seen elsewhere — describe it here and we'll put it to the artist or organiser."
      >
        <Field
          label="Event you'd like to sponsor"
          htmlFor="suggested_event_note"
        >
          <textarea
            id="suggested_event_note"
            name="suggested_event_note"
            className="textarea"
            placeholder="For example: “Late-Shift Sessions at Peckham Audio on 14 March — we'd like the merch stand and a story mention.”"
            defaultValue={d?.suggested_event_note ?? ""}
          />
        </Field>
        <Field label="Link to it" htmlFor="suggested_event_url" hint={URL_HINT}>
          <UrlInput
            id="suggested_event_url"
            name="suggested_event_url"
            label="The suggested event link"
            placeholder="e.g. eventbrite.co.uk/e/late-shift-sessions"
            defaultValue={d?.suggested_event_url ?? ""}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Campaign manager"
        description="Who our team should speak to about this campaign. We contact this person within 3 days."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Manager's name" htmlFor="manager_name" required>
            <input
              id="manager_name"
              name="manager_name"
              className="input"
              required
              defaultValue={d?.manager_name ?? ""}
            />
          </Field>
          <Field label="Manager's email" htmlFor="manager_email" required>
            <input
              id="manager_email"
              name="manager_email"
              type="email"
              className="input"
              required
              defaultValue={d?.manager_email ?? ""}
            />
          </Field>
        </div>
        <Field
          label="Manager's phone"
          htmlFor="manager_phone"
          required
          hint="Used to reach you quickly once we've reviewed your request."
        >
          <input
            id="manager_phone"
            name="manager_phone"
            type="tel"
            className="input"
            required
            placeholder="+44 7700 900000"
            defaultValue={d?.manager_phone ?? ""}
          />
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save changes" : "Submit request"} />
      </div>
    </form>
  );
}
