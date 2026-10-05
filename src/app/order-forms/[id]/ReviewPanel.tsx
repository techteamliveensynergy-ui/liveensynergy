"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ORDER_FORM_CONSENTS } from "@/lib/order-forms";
import {
  approveOrderForm,
  requestOrderFormChanges,
  type OrderFormReviewState,
} from "../actions";

function ApproveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary px-8 py-3 text-base" disabled={disabled || pending}>
      {pending ? "Approving…" : "Approve order form"}
    </button>
  );
}

function ChangesButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost" disabled={pending}>
      {pending ? "Sending…" : "Send change request"}
    </button>
  );
}

/** The brand's consent + approve / request-changes panel (shown only while the form awaits approval). */
export function ReviewPanel({ id }: { id: string }) {
  const [approveState, approveAction] = useActionState<OrderFormReviewState, FormData>(approveOrderForm, {});
  const [changesState, changesAction] = useActionState<OrderFormReviewState, FormData>(requestOrderFormChanges, {});
  const [details, setDetails] = useState(false);
  const [terms, setTerms] = useState(false);
  const [askChanges, setAskChanges] = useState(false);

  return (
    <section className="rounded-[2rem] border-2 border-[var(--color-brand)] bg-white p-8 sm:p-12 print:hidden">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-brand)]">Consents</p>
      <h2 className="mt-2 text-2xl font-semibold sm:text-3xl">Approve this campaign order</h2>
      <p className="mt-2 text-[var(--color-ink-soft)]">By approving this Campaign Order Form, the Brand confirms that:</p>

      <form action={approveAction} className="mt-6 space-y-4">
        <input type="hidden" name="id" value={id} />
        <label className="flex items-start gap-3 text-lg">
          <input
            type="checkbox"
            name="consent_details"
            className="mt-1.5 h-5 w-5"
            checked={details}
            onChange={(e) => setDetails(e.target.checked)}
          />
          <span>{ORDER_FORM_CONSENTS.details}</span>
        </label>
        <label className="flex items-start gap-3 text-lg">
          <input
            type="checkbox"
            name="consent_terms"
            className="mt-1.5 h-5 w-5"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
          />
          <span>
            It agrees to the{" "}
            <a href="/terms" target="_blank" className="underline">Terms and Conditions</a> and{" "}
            <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.
          </span>
        </label>
        {approveState.error && (
          <p role="alert" className="rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
            {approveState.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <ApproveButton disabled={!details || !terms} />
          <button type="button" className="btn btn-ghost" onClick={() => setAskChanges((x) => !x)}>
            Request changes
          </button>
        </div>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Approving sends your invoice straight away, so your campaign can go live as soon as it&apos;s paid.
        </p>
      </form>

      {askChanges && (
        <form action={changesAction} className="mt-6 space-y-3 border-t border-black/10 pt-6">
          <input type="hidden" name="id" value={id} />
          <label className="field-label" htmlFor="note">What would you like changed?</label>
          <textarea id="note" name="note" rows={4} className="textarea" required />
          {changesState.error && (
            <p role="alert" className="text-sm text-[var(--color-accent)]">{changesState.error}</p>
          )}
          <ChangesButton />
        </form>
      )}
    </section>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn btn-ghost print:hidden" onClick={() => window.print()}>
      Download PDF
    </button>
  );
}
