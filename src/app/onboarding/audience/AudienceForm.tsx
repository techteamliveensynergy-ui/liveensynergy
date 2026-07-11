"use client";

import { useActionState } from "react";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import {
  ErrorBanner,
  OnboardingSubmit,
  SuccessBanner,
} from "@/components/onboarding/parts";
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
          <Field label="Phone number" htmlFor="phone">
            <input
              id="phone"
              name="phone"
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

      <OnboardingSubmit
        label={mode === "profile" ? "Save changes" : "Finish & explore events"}
      />
    </form>
  );
}
