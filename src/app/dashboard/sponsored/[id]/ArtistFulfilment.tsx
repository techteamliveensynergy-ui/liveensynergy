"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileDrop } from "@/components/ui/FileDrop";
import { ATTACHMENT_HINT, MAX_ATTACHMENT_BYTES } from "@/lib/upload-limits";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  MATERIALS_CONSENT,
  PUBLISH_CONSENT,
  promoChannelLabels,
  type ArtistFulfilmentForm,
} from "@/lib/fulfilment-forms";
import {
  removeFulfilmentInvoice,
  requestFulfilmentChanges,
  saveFulfilmentPaymentDetails,
  submitFulfilmentForm,
  uploadFulfilmentInvoice,
  type FulfilmentState,
} from "../actions";

/**
 * The artist's side of the Artist / Organiser Fulfilment Form (0082), in the
 * brief's order. The page interleaves these with the sections that already
 * existed (event details, discount codes, proofs):
 *
 *   FulfilmentIntro → YourDetailsCard → [event details] → [discount codes]
 *   → PromotionalCommitmentsCard → SpecialTermsCard → [proofs]
 *   → PaymentCard → FinalConsentCard
 */

const SUBMIT_FORM_ID = "fulfilment-submit";

function Submit({ label, pending, className = "btn btn-primary text-sm" }: {
  label: string;
  pending: string;
  className?: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={busy}>
      {busy ? pending : label}
    </button>
  );
}

function Notice({ state }: { state: FulfilmentState }) {
  if (state.error) {
    return <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">{state.error}</p>;
  }
  if (state.message) {
    return <p className="mt-3 rounded-lg bg-[var(--color-mint)] px-3 py-2 text-sm">{state.message}</p>;
  }
  return null;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm font-medium">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold">{children}</h2>;
}

export function FulfilmentIntro({ form }: { form: ArtistFulfilmentForm }) {
  return (
    <div id="fulfilment" className="card scroll-mt-24 border-2 border-[var(--color-brand)]/40 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Artist / organiser fulfilment form</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            What Live·En·Synergy and the sponsor need from you for this event: your details, the discount codes,
            the promotional commitments, proof once they&apos;re done, and how you get paid. Work through the
            sections below, then submit at the end.
          </p>
        </div>
        <span
          className={`chip text-xs ${
            form.status === "submitted" ? "bg-[var(--color-sage)]" : "bg-[var(--color-gold)]"
          }`}
        >
          {form.status === "submitted"
            ? `Submitted ${form.submitted_at ? formatDate(form.submitted_at) : ""}`
            : form.status === "changes_requested"
              ? "Changes requested"
              : "Waiting for you"}
        </span>
      </div>
      {form.status === "changes_requested" && (
        <div className="mt-4 rounded-xl bg-[var(--color-gold)]/50 px-4 py-3 text-sm">
          <p className="font-semibold">
            You asked for changes{form.changes_requested_at ? ` on ${formatDate(form.changes_requested_at)}` : ""}
          </p>
          {form.changes_requested_note && <p className="mt-1 whitespace-pre-wrap">{form.changes_requested_note}</p>}
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            The team is updating the form and will send it back to you — you&apos;ll get an email.
          </p>
        </div>
      )}
      {form.codes_deadline && (
        <p className="mt-3 text-sm">
          <span className="font-semibold">Discount codes due by:</span> {formatDate(form.codes_deadline)}
        </p>
      )}
    </div>
  );
}

export interface ArtistDetails {
  name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  website_url: string | null;
}

export function YourDetailsCard({ details }: { details: ArtistDetails | null }) {
  return (
    <div className="card p-6">
      <Heading>Your details</Heading>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        From your profile.{" "}
        <Link href="/dashboard/profile" className="font-semibold text-[var(--color-brand-dark)]">
          Something out of date? Edit your profile
        </Link>
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Detail label="Name" value={details?.name} />
        <Detail label="Contact person" value={details?.contact_name} />
        <Detail label="Contact email" value={details?.contact_email} />
        <Detail label="Contact phone" value={details?.contact_phone} />
        <Detail label="Address" value={details?.address} />
        <Detail label="Website" value={details?.website_url} />
      </dl>
    </div>
  );
}

export function PromotionalCommitmentsCard({ form }: { form: ArtistFulfilmentForm }) {
  const channels = promoChannelLabels(form);
  return (
    <div className="card p-6">
      <Heading>Promotional commitments</Heading>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        Agreed with Live·En·Synergy for this campaign. If anything here isn&apos;t right, use “Request changes” at
        the end of the form.
      </p>
      <div className="mt-4">
        <p className="field-label">Agreed promotional channels</p>
        {channels.length ? (
          <ul className="mt-1 flex flex-wrap gap-2">
            {channels.map((c) => (
              <li key={c} className="chip bg-[var(--color-mist)] text-xs">{c}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">—</p>
        )}
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Detail label="Number of agreed posts" value={form.promo_post_count != null ? String(form.promo_post_count) : null} />
        <Detail label="Promotion start date" value={form.promo_start_date ? formatDate(form.promo_start_date) : null} />
        <div className="sm:col-span-2">
          <Detail label="Social media handles / URLs" value={form.promo_social_handles} />
        </div>
        <div className="sm:col-span-2">
          <Detail label="Social media post texts" value={form.promo_post_texts} />
        </div>
        <div className="sm:col-span-2">
          <Detail label="Other promotional requirements" value={form.promo_other_requirements} />
        </div>
      </dl>
    </div>
  );
}

export function SpecialTermsCard({ form }: { form: ArtistFulfilmentForm }) {
  return (
    <div className="card p-6">
      <Heading>Any other special terms</Heading>
      <p className="mt-3 whitespace-pre-wrap text-sm">
        {form.special_terms?.trim() ? form.special_terms : "None for this event."}
      </p>
    </div>
  );
}

export interface ArtistInvoice {
  id: string;
  file_name: string | null;
  url: string | null;
  created_at: string;
  mine: boolean;
}

export function PaymentCard({ form, invoices }: { form: ArtistFulfilmentForm; invoices: ArtistInvoice[] }) {
  const [saveState, saveAction] = useActionState<FulfilmentState, FormData>(saveFulfilmentPaymentDetails, {});
  const [uploadState, uploadAction] = useActionState<FulfilmentState, FormData>(uploadFulfilmentInvoice, {});
  // Before submitting, the details travel with the final submit (one click,
  // nothing typed and lost); afterwards they have their own Save.
  const submitted = form.status === "submitted";

  return (
    <div className="card p-6">
      <Heading>Terms of payment</Heading>
      <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm">
        {form.payment_terms?.trim() ? form.payment_terms : "The team will confirm the terms of payment."}
      </p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          {submitted ? (
            <form action={saveAction}>
              <input type="hidden" name="form_id" value={form.id} />
              <label className="block text-sm">
                <span className="field-label">Your payment details</span>
                <textarea
                  name="payment_details"
                  className="textarea mt-1"
                  rows={4}
                  maxLength={2000}
                  defaultValue={form.payment_details ?? ""}
                  placeholder="Account name, sort code and account number — or how you'd like to be paid"
                />
              </label>
              <div className="mt-2 flex justify-end">
                <Submit label="Save payment details" pending="Saving…" className="btn btn-ghost text-sm" />
              </div>
              <Notice state={saveState} />
            </form>
          ) : (
            <label className="block text-sm">
              <span className="field-label">Your payment details</span>
              <textarea
                name="payment_details"
                form={SUBMIT_FORM_ID}
                className="textarea mt-1"
                rows={4}
                maxLength={2000}
                defaultValue={form.payment_details ?? ""}
                placeholder="Account name, sort code and account number — or how you'd like to be paid"
                disabled={form.status !== "sent"}
              />
              <span className="field-hint">Saved when you submit the form below. Only you and the team can see this.</span>
            </label>
          )}
        </div>

        <div>
          <p className="field-label">Invoices</p>
          {invoices.length > 0 && (
            <ul className="mb-3 mt-1 space-y-1 text-sm">
              {invoices.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2">
                  <span className="min-w-0 truncate">
                    {inv.url ? (
                      <a href={inv.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--color-brand-dark)]">
                        {inv.file_name ?? "Invoice"} ↗
                      </a>
                    ) : (
                      inv.file_name ?? "Invoice"
                    )}
                    <span className="text-[var(--color-ink-soft)]"> · {formatDateTime(inv.created_at)}</span>
                  </span>
                  {inv.mine && (
                    <form action={removeFulfilmentInvoice}>
                      <input type="hidden" name="form_id" value={form.id} />
                      <input type="hidden" name="invoice_id" value={inv.id} />
                      <button type="submit" className="text-xs font-semibold text-[var(--color-accent)]">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form action={uploadAction} className="space-y-2">
            <input type="hidden" name="form_id" value={form.id} />
            <FileDrop
              name="file"
              accept="application/pdf,image/*,.doc,.docx"
              preview={false}
              maxBytes={MAX_ATTACHMENT_BYTES}
              allowedTypes={null}
              hint={ATTACHMENT_HINT}
              label="Drag your invoice here, or click to browse"
            />
            <div className="flex justify-end">
              <Submit label="Upload invoice" pending="Uploading…" className="btn btn-ghost text-sm" />
            </div>
          </form>
          <Notice state={uploadState} />
        </div>
      </div>
    </div>
  );
}

export function FinalConsentCard({
  form,
  codesConfirmed,
  hasCodes,
}: {
  form: ArtistFulfilmentForm;
  codesConfirmed: boolean;
  hasCodes: boolean;
}) {
  const [submitState, submitAction] = useActionState<FulfilmentState, FormData>(submitFulfilmentForm, {});
  const [changeState, changeAction] = useActionState<FulfilmentState, FormData>(requestFulfilmentChanges, {});
  const waiting = form.status === "sent";
  const submitted = form.status === "submitted";

  return (
    <div className="card p-6">
      <Heading>Confirm and submit</Heading>

      {hasCodes && !codesConfirmed && (
        <p className="mt-3 rounded-lg bg-[var(--color-gold)]/50 px-3 py-2 text-sm">
          Don&apos;t forget the discount codes —{" "}
          <a href="#discount-codes" className="font-semibold underline">confirm them above</a>
          {form.codes_deadline ? ` by ${formatDate(form.codes_deadline)}` : ""}. You can submit this form either way.
        </p>
      )}

      <form id={SUBMIT_FORM_ID} action={submitAction} className="mt-4 space-y-3">
        <input type="hidden" name="form_id" value={form.id} />
        <p className="field-label">Promotional confirmations</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent_publish" className="mt-1" disabled={!waiting} defaultChecked={submitted && form.consent_publish} />
          <span>{PUBLISH_CONSENT}</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent_materials" className="mt-1" disabled={!waiting} defaultChecked={submitted && form.consent_materials} />
          <span>{MATERIALS_CONSENT}</span>
        </label>
        <label className="flex items-start gap-2 border-t border-black/10 pt-3 text-sm">
          <input
            type="checkbox"
            name="consent_terms_privacy"
            className="mt-1"
            disabled={!waiting}
            defaultChecked={submitted && form.consent_terms_privacy}
          />
          <span>
            I/We agree to the{" "}
            <a href="/terms#artist" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              Terms &amp; Conditions
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              Privacy Policy
            </a>
            .
          </span>
        </label>
        {waiting && (
          <div className="flex justify-end">
            <Submit label="Submit fulfilment form" pending="Submitting…" />
          </div>
        )}
        {submitted && (
          <p className="rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">
            ✓ Submitted{form.submitted_at ? ` ${formatDateTime(form.submitted_at)}` : ""}. You can still add proof,
            invoices and payment details above. To change anything else, message the team.
          </p>
        )}
      </form>
      <Notice state={submitState} />

      {waiting && (
        <details className="mt-5 rounded-xl border border-black/10 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Something not right? Request changes</summary>
          <form action={changeAction} className="mt-3 space-y-2">
            <input type="hidden" name="form_id" value={form.id} />
            <textarea
              name="note"
              className="textarea"
              rows={3}
              maxLength={2000}
              placeholder="Tell the team what should change — e.g. the number of posts, the start date, the payment terms"
            />
            <div className="flex justify-end">
              <Submit label="Send to the team" pending="Sending…" className="btn btn-ghost text-sm" />
            </div>
          </form>
          <Notice state={changeState} />
        </details>
      )}
    </div>
  );
}
