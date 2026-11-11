"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { PhoneInput } from "@/components/ui/PhoneInput";
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

  // A rejected save echoes back what was submitted; show that rather than
  // reverting to what's stored, so the field being complained about still
  // holds the value the complaint is about.
  const d = { ...(defaults ?? {}), ...(state.values ?? {}) } as Partial<
    AudienceMember
  >;

  // Fields backed by component state only pick up new defaults on mount, so
  // they're remounted whenever a submission comes back with values.
  const attempt = state.values ? JSON.stringify(state.values) : "initial";

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="mode" value={mode} />
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <FormSection
        title="Your details"
        description="Your personal details are never shared with any partner without your consent."
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
            <PhoneInput
              key={`phone-${attempt}`}
              defaultCountryCode={d.phone_country_code}
              defaultPhone={d.phone}
              required
            />
          </Field>
          {/* No date of birth, gender, country, address or postcode (Testing notes
              7 Nov, retest 11 Nov): name and phone are all we need. */}
        </div>
      </FormSection>

      {/* --- Not yet built. Flows still to be decided — see docs/PLATFORM.md.
          Kept out of first-time onboarding (13 Oct walkthrough: a "Coming
          soon" box was the first thing a new audience member couldn't use). */}

      {mode === "profile" && (
      <Placeholder
        title="What do you love going to?"
        description="Pick your favourite categories and we'll surface partnered events that match."
        note="Not active yet — for now every confirmed partnered event shows up under Discover events, unfiltered."
      >
        <div className="flex flex-wrap gap-2">
          {EVENT_CATEGORIES.map((c) => (
            <PlaceholderChip key={c} label={c} />
          ))}
        </div>
      </Placeholder>
      )}

      <OnboardingSubmit
        label={mode === "profile" ? "Save changes" : "Finish & explore events"}
        confirmSave={mode === "profile"}
      />
    </form>
  );
}
