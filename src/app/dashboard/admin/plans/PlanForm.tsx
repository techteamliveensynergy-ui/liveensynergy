"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import type { Plan } from "@/lib/types";
import { createPlan, updatePlan, type AdminState } from "../actions";

const INTERVALS = ["free", "month", "year", "one_off"];

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Saving…" : label}
    </button>
  );
}

export function PlanForm({ plan }: { plan?: Plan }) {
  const editing = Boolean(plan);
  const action = editing ? updatePlan : createPlan;
  const [state, formAction] = useActionState<AdminState, FormData>(action, {});
  const d = plan;

  return (
    <form action={formAction} className="space-y-6">
      {editing && <input type="hidden" name="id" value={plan!.id} />}
      <ErrorBanner error={state.error} />

      <FormSection title="Plan details">
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
          <Field label="Slug" htmlFor="slug" required hint="Unique, e.g. pro">
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (GBP)" htmlFor="price_gbp">
            <input
              id="price_gbp"
              name="price_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              defaultValue={d?.price_gbp ?? 0}
            />
          </Field>
          <Field label="Billing interval" htmlFor="billing_interval">
            <select
              id="billing_interval"
              name="billing_interval"
              className="select"
              defaultValue={d?.billing_interval ?? "month"}
            >
              {INTERVALS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
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
        <Field
          label="Features"
          htmlFor="features"
          hint="One feature per line."
        >
          <textarea
            id="features"
            name="features"
            className="textarea"
            defaultValue={(d?.features ?? []).join("\n")}
          />
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit label={editing ? "Save changes" : "Create plan"} />
      </div>
    </form>
  );
}
