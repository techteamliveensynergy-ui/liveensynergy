"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import type { SurveyTemplate } from "@/lib/types";
import { createSurveyTemplate, updateSurveyTemplate, type SurveyState } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export interface CampaignOption {
  id: string;
  reference: string;
  brand_name: string | null;
}

export function SurveyTemplateForm({
  template,
  campaigns,
}: {
  template?: SurveyTemplate;
  campaigns: CampaignOption[];
}) {
  const editing = Boolean(template);
  const action = editing ? updateSurveyTemplate : createSurveyTemplate;
  const [state, formAction] = useActionState<SurveyState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={template!.id} />}
      <ErrorBanner error={state.error} />
      <SuccessBanner show={state.success} />

      <FormSection title="Survey details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor="title" required>
            <input
              id="title"
              name="title"
              className="input"
              required
              defaultValue={template?.title ?? ""}
            />
          </Field>
          <Field label="Kind" htmlFor="kind" required>
            <select
              id="kind"
              name="kind"
              className="select"
              defaultValue={template?.kind ?? "pre_event"}
            >
              <option value="pre_event">Pre-event</option>
              <option value="post_event">Post-event</option>
            </select>
          </Field>
        </div>

        <Field
          label="Campaign"
          htmlFor="campaign_id"
          hint="Required before this survey can be published."
        >
          <select
            id="campaign_id"
            name="campaign_id"
            className="select"
            defaultValue={template?.campaign_id ?? ""}
          >
            <option value="">No campaign linked yet</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reference}
                {c.brand_name ? ` · ${c.brand_name}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            className="textarea"
            defaultValue={template?.description ?? ""}
          />
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save details" : "Create survey"} />
      </div>
    </form>
  );
}
