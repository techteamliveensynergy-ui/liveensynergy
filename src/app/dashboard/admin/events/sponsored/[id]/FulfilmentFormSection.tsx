"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveFulfilmentForm,
  reopenFulfilmentForm,
  type FulfilmentAdminState,
} from "../../../fulfilment-actions";
import {
  CODES_DEADLINE_DAYS,
  CODES_NOTICE_CONSENT,
  FULFILMENT_STATUS_LABELS,
  MATERIALS_CONSENT,
  PROMO_CHANNELS,
  PUBLISH_CONSENT,
  codesDeadlinePassed,
  promoChannelLabels,
  type ArtistFulfilmentForm,
} from "@/lib/fulfilment-forms";
import { formatDate, formatDateTime } from "@/lib/format";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";

export interface AdminFulfilmentInvoice {
  id: string;
  file_name: string | null;
  url: string | null;
  created_at: string;
}

function Buttons({ hasArtist }: { hasArtist: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <button type="submit" name="intent" value="save" className="btn btn-ghost text-sm" disabled={pending}>
        {pending ? "Saving…" : "Save draft"}
      </button>
      <button
        type="submit"
        name="intent"
        value="send"
        className="btn btn-primary text-sm"
        disabled={pending || !hasArtist}
        title={hasArtist ? undefined : "This event has no artist or organiser yet"}
      >
        {pending ? "Sending…" : "Send to artist"}
      </button>
    </div>
  );
}

function Tick({ on, label }: { on: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span aria-hidden className={on ? "text-[var(--color-olive-deep)]" : "text-[var(--color-ink-soft)]"}>
        {on ? "✓" : "○"}
      </span>
      <span className={on ? "" : "text-[var(--color-ink-soft)]"}>{label}</span>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

/**
 * Admin side of the Artist / Organiser Fulfilment Form (0082): pre-fill the
 * promotional commitments, special terms, terms of payment and codes deadline,
 * send it, and see what the artist confirmed. A sent or submitted form is
 * read-only until reopened.
 */
export function FulfilmentFormSection({
  eventId,
  form,
  invoices,
  hasArtist,
  codesConfirmedAt,
  prefillRequirements,
}: {
  eventId: string;
  form: ArtistFulfilmentForm | null;
  invoices: AdminFulfilmentInvoice[];
  hasArtist: boolean;
  codesConfirmedAt: string | null;
  /** The order form's social-media details — a starting point for a new form. */
  prefillRequirements: string | null;
}) {
  const [state, action] = useActionState<FulfilmentAdminState, FormData>(saveFulfilmentForm, {});
  const editable = !form || form.status === "draft" || form.status === "changes_requested";
  const deadlineMissed = !!form && form.status !== "draft" && !codesConfirmedAt && codesDeadlinePassed(form.codes_deadline);

  return (
    <div id="fulfilment" className="card scroll-mt-24 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
            Artist / organiser fulfilment form
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            The artist&apos;s side of the order form: codes, promotional commitments, special terms and payment.
          </p>
        </div>
        <span className="rounded-full bg-[var(--color-mist)] px-3 py-1 text-xs font-semibold text-[var(--color-ink-soft)]">
          {form ? FULFILMENT_STATUS_LABELS[form.status] : "Not started"}
        </span>
      </div>

      {form?.status === "changes_requested" && form.changes_requested_note && (
        <div className="mt-4 rounded-xl bg-[var(--color-gold)]/50 px-4 py-3 text-sm">
          <p className="font-semibold">
            The artist asked for changes{form.changes_requested_at ? ` · ${formatDateTime(form.changes_requested_at)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{form.changes_requested_note}</p>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Update the form below and send it again.</p>
        </div>
      )}
      {deadlineMissed && (
        <p className="mt-4 rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          The codes deadline ({formatDate(form!.codes_deadline)}) has passed and the artist hasn&apos;t confirmed
          the discount codes yet.
        </p>
      )}

      {editable ? (
        <form action={action} className="mt-5 grid gap-4">
          <input type="hidden" name="sponsored_event_id" value={eventId} />

          <label className="text-sm sm:max-w-xs">
            <span className="field-label">Discount codes due by</span>
            <input name="codes_deadline" type="date" className="input mt-1" defaultValue={form?.codes_deadline ?? ""} />
            <span className="field-hint">Left blank, it&apos;s set to {CODES_DEADLINE_DAYS} days from sending.</span>
          </label>

          <fieldset className="rounded-xl border border-black/10 p-4">
            <legend className="px-1 text-sm font-semibold">Promotional commitments</legend>
            <p className="field-label mt-1">Agreed promotional channels</p>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {PROMO_CHANNELS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="promo_channels" value={c.key} defaultChecked={form?.promo_channels.includes(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
            <label className="mt-3 block text-sm">
              <span className="field-label">Other agreed channels</span>
              <textarea
                name="promo_channels_custom"
                className="textarea mt-1"
                rows={2}
                placeholder="One per line — e.g. Podcast mention, YouTube Short"
                defaultValue={form?.promo_channels_custom.join("\n") ?? ""}
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="field-label">Number of agreed posts</span>
                <input name="promo_post_count" type="number" min={0} max={1000} className="input mt-1" placeholder="e.g. 2" defaultValue={form?.promo_post_count ?? ""} />
              </label>
              <label className="text-sm">
                <span className="field-label">Promotion start date</span>
                <input name="promo_start_date" type="date" className="input mt-1" defaultValue={form?.promo_start_date ?? ""} />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              <span className="field-label">Social media handles / URLs</span>
              <textarea name="promo_social_handles" className="textarea mt-1" rows={2} placeholder="@artistname / account URLs" defaultValue={form?.promo_social_handles ?? ""} />
            </label>
            <label className="mt-3 block text-sm">
              <span className="field-label">Social media post texts</span>
              <textarea name="promo_post_texts" className="textarea mt-1" rows={4} placeholder="The copy to post, including the campaign link and tags" defaultValue={form?.promo_post_texts ?? ""} />
            </label>
            <label className="mt-3 block text-sm">
              <span className="field-label">Other promotional requirements</span>
              <textarea
                name="promo_other_requirements"
                className="textarea mt-1"
                rows={3}
                placeholder="Timing, formats, tagging, pinned links, story duration, etc."
                defaultValue={form ? (form.promo_other_requirements ?? "") : (prefillRequirements ?? "")}
              />
            </label>
          </fieldset>

          <label className="text-sm">
            <span className="field-label">Any other special terms</span>
            <textarea name="special_terms" className="textarea mt-1" rows={3} defaultValue={form?.special_terms ?? ""} />
          </label>

          <label className="text-sm">
            <span className="field-label">Terms of payment to the artist / organiser</span>
            <textarea
              name="payment_terms"
              className="textarea mt-1"
              rows={3}
              placeholder="Amount, when it is paid, what is needed first (invoice, proof of promotion…)"
              defaultValue={form?.payment_terms ?? ""}
            />
          </label>

          {state.error && (
            <p className="rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">{state.error}</p>
          )}
          <Buttons hasArtist={hasArtist} />
        </form>
      ) : (
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <Row label="Discount codes due by" value={formatDate(form!.codes_deadline)} />
          <Row label="Sent" value={form!.sent_at ? formatDateTime(form!.sent_at) : null} />
          <Row label="Agreed promotional channels" value={promoChannelLabels(form!).join("\n")} />
          <Row label="Number of agreed posts" value={form!.promo_post_count != null ? String(form!.promo_post_count) : null} />
          <Row label="Promotion start date" value={form!.promo_start_date ? formatDate(form!.promo_start_date) : null} />
          <Row label="Social media handles / URLs" value={form!.promo_social_handles} />
          <div className="sm:col-span-2"><Row label="Social media post texts" value={form!.promo_post_texts} /></div>
          <div className="sm:col-span-2"><Row label="Other promotional requirements" value={form!.promo_other_requirements} /></div>
          <div className="sm:col-span-2"><Row label="Any other special terms" value={form!.special_terms} /></div>
          <div className="sm:col-span-2"><Row label="Terms of payment" value={form!.payment_terms} /></div>
        </dl>
      )}

      {form && form.status !== "draft" && (
        <div className="mt-6 border-t border-black/10 pt-4">
          <h3 className="text-sm font-semibold">From the artist</h3>
          <ul className="mt-2 space-y-1">
            <Tick on={!!codesConfirmedAt} label={`Discount codes confirmed${codesConfirmedAt ? ` · ${formatDateTime(codesConfirmedAt)}` : ""} (with: “${CODES_NOTICE_CONSENT}”)`} />
            <Tick on={form.consent_publish} label={PUBLISH_CONSENT} />
            <Tick on={form.consent_materials} label={MATERIALS_CONSENT} />
            <Tick
              on={form.consent_terms_privacy}
              label={`Agreed to the Terms & Conditions and Privacy Policy${form.terms_version ? ` (version ${form.terms_version})` : ""}`}
            />
          </ul>
          {form.submitted_at && (
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">Submitted {formatDateTime(form.submitted_at)}</p>
          )}
          <dl className="mt-3">
            <Row label="Payment details" value={form.payment_details} />
          </dl>
          <p className="field-label mt-3">Invoices</p>
          {invoices.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">None uploaded yet.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  {inv.url ? (
                    <a href={inv.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--color-brand-dark)]">
                      {inv.file_name ?? "Invoice"} ↗
                    </a>
                  ) : (
                    <span>{inv.file_name ?? "Invoice"}</span>
                  )}
                  <span className="text-[var(--color-ink-soft)]"> · {formatDateTime(inv.created_at)}</span>
                </li>
              ))}
            </ul>
          )}

          {!editable && (
            <form action={reopenFulfilmentForm} className="mt-4 flex justify-end">
              <input type="hidden" name="sponsored_event_id" value={eventId} />
              <ConfirmSubmit
                label="Reopen for editing"
                pendingLabel="Reopening…"
                title="Reopen the fulfilment form?"
                body={
                  <>
                    The form goes back to draft and the artist&apos;s confirmations are cleared — they&apos;ll confirm
                    the new version once you send it again. Their payment details and invoices stay, and the earlier
                    submission stays in the consent log.
                  </>
                }
                confirmLabel="Yes, reopen it"
                className="btn btn-ghost text-sm"
              />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
