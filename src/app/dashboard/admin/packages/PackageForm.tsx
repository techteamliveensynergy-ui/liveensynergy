"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import type { CampaignPackage } from "@/lib/types";
import { createPackage, updatePackage, type AdminState } from "../actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function PackageForm({ pkg }: { pkg?: CampaignPackage }) {
  const editing = Boolean(pkg);
  const action = editing ? updatePackage : createPackage;
  const [state, formAction] = useActionState<AdminState, FormData>(action, {});
  const d = pkg;
  const [isCustom, setIsCustom] = useState(d?.is_custom_price ?? false);

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={pkg!.id} />}
      <ErrorBanner error={state.error} />

      <FormSection title="Package details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name" required>
            <input
              id="name"
              name="name"
              className="input"
              required
              defaultValue={d?.name ?? ""}
            />
          </Field>
          <Field
            label="Slug"
            htmlFor="slug"
            required
            hint="Unique, e.g. starter"
          >
            <input
              id="slug"
              name="slug"
              className="input"
              required
              defaultValue={d?.slug ?? ""}
            />
          </Field>
        </div>
        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            name="description"
            className="textarea"
            defaultValue={d?.description ?? ""}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_custom_price"
            checked={isCustom}
            onChange={(e) => setIsCustom(e.target.checked)}
          />
          Custom price (Enterprise-style — a bounded free-entry budget instead
          of a fixed price)
        </label>

        {isCustom ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Minimum price (GBP)"
              htmlFor="min_price_gbp"
              required
            >
              <input
                id="min_price_gbp"
                name="min_price_gbp"
                type="number"
                min={0}
                step="0.01"
                className="input"
                defaultValue={d?.min_price_gbp ?? ""}
              />
            </Field>
            <Field
              label="Price increment (GBP)"
              htmlFor="price_increment_gbp"
              required
              hint="Brand's budget must land on a multiple of this above the minimum."
            >
              <input
                id="price_increment_gbp"
                name="price_increment_gbp"
                type="number"
                min={0}
                step="0.01"
                className="input"
                defaultValue={d?.price_increment_gbp ?? ""}
              />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (GBP)" htmlFor="price_gbp" required>
              <input
                id="price_gbp"
                name="price_gbp"
                type="number"
                min={0}
                step="0.01"
                className="input"
                defaultValue={d?.price_gbp ?? ""}
              />
            </Field>
            <Field
              label="Participant count"
              htmlFor="participant_count"
              required
            >
              <input
                id="participant_count"
                name="participant_count"
                type="number"
                min={0}
                className="input"
                defaultValue={d?.participant_count ?? ""}
              />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Platform margin (GBP)"
            htmlFor="platform_margin_gbp"
            hint="What the platform keeps from this package's price — the rest becomes the sponsorship's reward pool."
          >
            <input
              id="platform_margin_gbp"
              name="platform_margin_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              defaultValue={d?.platform_margin_gbp ?? 0}
            />
          </Field>
          <Field label="Sort order" htmlFor="sort_order">
            <input
              id="sort_order"
              name="sort_order"
              type="number"
              className="input"
              defaultValue={d?.sort_order ?? 0}
            />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save changes" : "Create package"} />
      </div>
    </form>
  );
}
