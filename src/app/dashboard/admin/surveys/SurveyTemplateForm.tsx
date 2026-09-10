"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner, SuccessBanner } from "@/components/onboarding/parts";
import type { SurveyTemplate, SurveyTemplateKind } from "@/lib/types";
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
  const [kind, setKind] = useState<SurveyTemplateKind>(template?.kind ?? "pre_event");

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
              value={kind}
              onChange={(e) => setKind(e.target.value as SurveyTemplateKind)}
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

        {kind === "pre_event" && (
          <>
            <label className="flex items-start gap-2.5 text-sm font-medium text-[var(--color-ink)]">
              <input
                type="checkbox"
                name="is_public"
                defaultChecked={template?.is_public ?? false}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>
                Public &amp; link-shareable — anyone with the link can answer, no account
                required.
              </span>
            </label>

            <Field
              label="Intro message"
              htmlFor="intro_message"
              hint="Shown above the questions on the public page."
            >
              <textarea
                id="intro_message"
                name="intro_message"
                className="textarea"
                defaultValue={template?.intro_message ?? ""}
              />
            </Field>

            <Field
              label="Thank-you message"
              htmlFor="thank_you_message"
              hint="Shown on the CTA screen after someone submits."
            >
              <textarea
                id="thank_you_message"
                name="thank_you_message"
                className="textarea"
                defaultValue={template?.thank_you_message ?? ""}
              />
            </Field>
          </>
        )}
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save details" : "Create survey"} />
      </div>
    </form>
  );
}
