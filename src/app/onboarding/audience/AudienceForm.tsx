"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import {
  ErrorBanner,
  OnboardingSubmit,
  SuccessBanner,
} from "@/components/onboarding/parts";
import { Placeholder, PlaceholderChip } from "@/components/ui/Placeholder";
import { EVENT_CATEGORIES } from "@/lib/constants";
import type { AudienceMember } from "@/lib/types";
import { saveAudience, type OnboardingState } from "../actions";

type Mode = "onboarding" | "profile";

export function AudienceForm({
  mode = "onboarding",
  defaults,
}: {
  mode?: Mode;
  defaults?: Partial<AudienceMember>;
}) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(
    saveAudience,
    {},
  );
  const d = defaults ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <FormSection
        title="Your details"
        description="We use these to verify your attendance and release your rewards. Your details are never shared without your consent."
      >
        <Field label="Full name" htmlFor="full_name" required>
          <input
            id="full_name"
            name="full_name"
            className="input"
            required
            defaultValue={d.full_name ?? ""}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Phone number"
            htmlFor="phone"
            required
            hint="Helps us confirm it's really you when a reward is released."
          >
            <input
              id="phone"
              name="phone"
              type="tel"
              required
              className="input"
              defaultValue={d.phone ?? ""}
            />
          </Field>
          <Field label="Date of birth" htmlFor="date_of_birth">
            <input
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              className="input"
              defaultValue={d.date_of_birth ?? ""}
            />
          </Field>
        </div>
        <Field label="Address" htmlFor="address">
          <textarea
            id="address"
            name="address"
            className="textarea"
            defaultValue={d.address ?? ""}
          />
        </Field>
        <Field label="Postcode" htmlFor="postcode">
          <input
            id="postcode"
            name="postcode"
            className="input"
            defaultValue={d.postcode ?? ""}
          />
        </Field>
      </FormSection>

      {/* --- Not yet built. Flows still to be decided — see docs/PLATFORM.md. --- */}

      <Placeholder
        title="What do you love going to?"
        description="Pick your favourite categories and we'll surface sponsored events that match."
        note="Not active yet — for now every confirmed sponsored event shows up under Discover events, unfiltered."
      >
        <div className="flex flex-wrap gap-2">
          {EVENT_CATEGORIES.map((c) => (
            <PlaceholderChip key={c} label={c} />
          ))}
        </div>
      </Placeholder>

      <Placeholder
        title="Payout details"
        description="Where we send your reward once your attendance is verified."
        note="Not collected here yet. If you're selected for a reward, you'll be asked to consent and share payout details from My events."
      />

      <OnboardingSubmit
        label={mode === "profile" ? "Save changes" : "Finish & explore events"}
      />
    </form>
  );
}
