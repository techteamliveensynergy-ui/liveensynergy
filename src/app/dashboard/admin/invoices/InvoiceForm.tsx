"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/OnboardingShell";
import { ErrorBanner } from "@/components/onboarding/parts";
import { createInvoice, type InvoiceState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? "Creating…" : "Create invoice"}
    </button>
  );
}

export function InvoiceForm({
  brands,
  prefill,
}: {
  brands: { id: string; brand_name: string }[];
  prefill?: {
    brandId?: string;
    sponsoredEventId?: string;
    campaignId?: string;
    amountGbp?: number;
  };
}) {
  const [state, formAction] = useActionState<InvoiceState, FormData>(
    createInvoice,
    {},
  );

  return (
    <form action={formAction} className="space-y-6">
      <ErrorBanner error={state.error} />
      {prefill?.sponsoredEventId && (
        <input type="hidden" name="sponsored_event_id" value={prefill.sponsoredEventId} />
      )}
      {prefill?.campaignId && (
        <input type="hidden" name="campaign_id" value={prefill.campaignId} />
      )}

      <FormSection title="Invoice details">
        <Field label="Brand" htmlFor="brand_id" required>
          <select
            id="brand_id"
            name="brand_id"
            className="select"
            required
            defaultValue={prefill?.brandId ?? ""}
          >
            <option value="">Select a brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.brand_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (GBP)" htmlFor="amount_gbp" required>
            <input
              id="amount_gbp"
              name="amount_gbp"
              type="number"
              min={0}
              step="0.01"
              className="input"
              required
              defaultValue={prefill?.amountGbp ?? ""}
            />
          </Field>
          <Field label="Due date" htmlFor="due_date">
            <input id="due_date" name="due_date" type="date" className="input" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes">
          <textarea id="notes" name="notes" className="textarea" />
        </Field>
      </FormSection>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  );
}
