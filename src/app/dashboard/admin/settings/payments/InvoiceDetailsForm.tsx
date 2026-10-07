"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { saveInvoiceDetails, type InvoiceDetailsState } from "./invoice-details-actions";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={pending}>
      {pending ? "Saving…" : "Save invoice details"}
    </button>
  );
}

export function InvoiceDetailsForm({
  whatsapp,
  bankDetails,
  contactNote,
}: {
  whatsapp: string | null;
  bankDetails: string | null;
  contactNote: string | null;
}) {
  const [state, action] = useActionState<InvoiceDetailsState, FormData>(saveInvoiceDetails, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="field-label" htmlFor="whatsapp">WhatsApp number</label>
          <input id="whatsapp" name="whatsapp" className="input" defaultValue={whatsapp ?? ""} placeholder="+44 7700 900123" />
        </div>
        <div>
          <label className="field-label" htmlFor="contact_note">Other contact line (optional)</label>
          <input id="contact_note" name="contact_note" className="input" defaultValue={contactNote ?? ""} placeholder="e.g. accounts@yourdomain.com" />
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="bank_details">Bank-transfer details</label>
        <textarea
          id="bank_details"
          name="bank_details"
          rows={4}
          className="textarea"
          defaultValue={bankDetails ?? ""}
          placeholder={"Account name: …\nSort code: …\nAccount number: …"}
        />
        <p className="field-hint">
          Printed at the foot of every Stripe invoice, on the invoice page and in invoice emails. Brands paying through
          Stripe&apos;s bank-transfer option get their own matched account number on the payment page instead.
        </p>
      </div>
      {state.error && <p role="alert" className="text-sm text-[var(--color-accent)]">{state.error}</p>}
      {state.message && <p role="status" className="text-sm text-[var(--color-olive-deep)]">{state.message}</p>}
      <Save />
    </form>
  );
}
