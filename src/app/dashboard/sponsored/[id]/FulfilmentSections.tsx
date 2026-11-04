"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FileDrop } from "@/components/ui/FileDrop";
import {
  INVOICE_ACCEPT,
  INVOICE_HINT,
  INVOICE_TYPES,
  INVOICE_STATUS_LABELS,
  PROMO_CONFIRMATIONS,
  WAITING_FOR_FULFILMENT,
  hasPromo,
  type ArtistInvoice,
  type FulfilmentStep,
  type SponsoredEventFulfilment,
} from "@/lib/fulfilment";
import {
  confirmPromotionTerms,
  submitFulfilment,
  uploadArtistInvoice,
  type FulfilmentActionState,
} from "../fulfilment-actions";

function Submit({ label, pending, disabled }: { label: string; pending: string; disabled?: boolean }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary text-sm" disabled={isPending || disabled}>
      {isPending ? pending : label}
    </button>
  );
}

function GhostSubmit({ label, pending }: { label: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-ghost text-sm" disabled={isPending}>
      {isPending ? pending : label}
    </button>
  );
}

function Notice({ state }: { state: FulfilmentActionState }) {
  if (state.error) {
    return (
      <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">{state.error}</p>
    );
  }
  if (state.message) {
    return <p className="mt-3 rounded-lg bg-[var(--color-mint)] px-3 py-2 text-sm">{state.message}</p>;
  }
  return null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="text-sm text-[var(--color-ink)]">{children}</dd>
    </div>
  );
}

const dash = <span className="text-[var(--color-ink-soft)]">—</span>;

/** The checklist at the head of the artist's form: where they are, what's left. */
export function FulfilmentChecklist({
  steps,
  live,
  waivedReason,
  needsReconfirm,
}: {
  steps: FulfilmentStep[];
  live: boolean;
  waivedReason: string | null;
  /** The team changed the terms after the artist agreed. */
  needsReconfirm: boolean;
}) {
  return (
    <div id="fulfilment" className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Fulfilment form</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            live
              ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
              : "bg-[var(--color-gold)] text-[var(--color-ink)]"
          }`}
        >
          {live ? "Live" : WAITING_FOR_FULFILMENT}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        {live
          ? "Your event is live. Thank you for completing the form."
          : "Complete these steps and your event goes live automatically."}
      </p>
      {live && waivedReason && (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">The team put this event live: {waivedReason}</p>
      )}
      {needsReconfirm && (
        <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
          The team updated the terms. Please read them below and confirm again.
        </p>
      )}
      <ol className="mt-4 space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3 text-sm" data-testid={`fulfilment-step-${s.key}`}>
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                s.done ? "bg-[var(--color-olive-deep)] text-white" : "bg-[var(--color-mist)] text-[var(--color-ink-soft)]"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span>
              <span className={s.done ? "text-[var(--color-ink-soft)] line-through" : "font-medium"}>{s.label}</span>
              {s.hint && !s.done && (
                <span className="block text-xs text-[var(--color-ink-soft)]">{s.hint}</span>
              )}
              {s.hint && s.done && <span className="sr-only"> — {s.hint}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Promotional commitments + special terms + proof requirements, as written by
 * the team, with the four confirmations under them (Sakshi's doc).
 * Hidden when the team hasn't filled any of it in (old sponsorships).
 */
export function PromoCommitmentsSection({
  eventId,
  fulfilment: f,
}: {
  eventId: string;
  fulfilment: SponsoredEventFulfilment;
}) {
  const [state, action] = useActionState<FulfilmentActionState, FormData>(confirmPromotionTerms, {});
  if (!hasPromo(f)) return null;
  const confirmed = !!f.promo_consent_at;

  return (
    <div id="promotional-commitments" className="card p-6">
      <h2 className="text-lg font-semibold">Promotional commitments</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        What you&apos;ve agreed to do to promote this event — filled in by the Live·En·Synergy team.
      </p>

      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Row label="Agreed promotional channels">
            {f.promo_channels.length > 0 ? (
              <ul className="mt-1 flex flex-wrap gap-2">
                {f.promo_channels.map((c) => (
                  <li key={c} className="chip">
                    {c}
                  </li>
                ))}
              </ul>
            ) : (
              dash
            )}
          </Row>
        </div>
        <Row label="Number of agreed posts">{f.promo_post_count ?? dash}</Row>
        <Row label="Promotion start date">
          {f.promo_start_date
            ? new Date(`${f.promo_start_date}T00:00:00Z`).toLocaleDateString("en-GB", {
                dateStyle: "medium",
                timeZone: "UTC",
              })
            : dash}
        </Row>
        <div className="sm:col-span-2">
          <Row label="Social media handles / URLs">
            {f.promo_urls.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {f.promo_urls.map((u) => (
                  <li key={u} className="break-all">
                    {u}
                  </li>
                ))}
              </ul>
            ) : (
              dash
            )}
          </Row>
        </div>
        {f.promo_post_texts && (
          <div className="sm:col-span-2">
            <Row label="Social media post texts">
              <span className="whitespace-pre-wrap">{f.promo_post_texts}</span>
            </Row>
          </div>
        )}
        {f.promo_other && (
          <div className="sm:col-span-2">
            <Row label="Other promotional requirements">
              <span className="whitespace-pre-wrap">{f.promo_other}</span>
            </Row>
          </div>
        )}
        {f.special_terms && (
          <div className="sm:col-span-2">
            <Row label="Any other special terms">
              <span className="whitespace-pre-wrap">{f.special_terms}</span>
            </Row>
          </div>
        )}
        {(f.proof_requirements || f.proof_min_count != null) && (
          <div className="sm:col-span-2">
            <Row label="Proof we need from you">
              {f.proof_min_count != null && (
                <span className="block">
                  At least {f.proof_min_count} proof upload{f.proof_min_count === 1 ? "" : "s"}, once the posts are live
                  (the &ldquo;Proof of terms&rdquo; section below).
                </span>
              )}
              {f.proof_requirements && <span className="block whitespace-pre-wrap">{f.proof_requirements}</span>}
            </Row>
          </div>
        )}
      </dl>

      <div className="mt-5 rounded-xl bg-[var(--color-mist)] p-4">
        <h3 className="text-sm font-semibold">Promotional confirmations</h3>
        {confirmed ? (
          <>
            <ul className="mt-2 space-y-1 text-sm">
              {f.promo_consent_statements.map((s) => (
                <li key={s} className="flex gap-2">
                  <span aria-hidden className="text-[var(--color-olive-deep)]">
                    ✓
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
              Confirmed on{" "}
              {new Date(f.promo_consent_at!).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/London",
              })}
              . If the team changes these terms you&apos;ll be asked to confirm again.
            </p>
          </>
        ) : (
          <form action={action} className="mt-2 space-y-2">
            <input type="hidden" name="event_id" value={eventId} />
            {PROMO_CONFIRMATIONS.map((s, i) => (
              <label key={s} className="flex items-start gap-2 text-sm">
                <input type="checkbox" name={`confirm_${i}`} className="mt-1" />
                <span>{s}</span>
              </label>
            ))}
            <Notice state={state} />
            <div className="pt-1">
              <Submit label="Confirm promotional commitments" pending="Confirming…" />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Payment terms (from the team) + invoice upload. Artist and admin only. */
export function PaymentInvoiceSection({
  eventId,
  fulfilment: f,
  invoices,
  invoiceNeeded,
}: {
  eventId: string;
  fulfilment: SponsoredEventFulfilment;
  /** `href` is a short-lived signed link, made on the server. */
  invoices: (ArtistInvoice & { href: string | null })[];
  invoiceNeeded: boolean;
}) {
  const [state, action] = useActionState<FulfilmentActionState, FormData>(uploadArtistInvoice, {});
  return (
    <div id="payment" className="card p-6">
      <h2 className="text-lg font-semibold">Payment &amp; invoice</h2>

      <div className="mt-3">
        <p className="field-label">Terms of payment</p>
        {f.payment_terms ? (
          <p className="whitespace-pre-wrap text-sm">{f.payment_terms}</p>
        ) : (
          <p className="text-sm text-[var(--color-ink-soft)]">
            The team will add your payment terms here. Nothing is due from you until they do.
          </p>
        )}
      </div>

      <div className="mt-5 border-t border-black/10 pt-4">
        <p className="field-label">Your invoice{invoiceNeeded ? " (required)" : ""}</p>
        <form action={action} className="mt-2 grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="event_id" value={eventId} />
          <label className="text-sm">
            <span className="field-label">Invoice number (optional)</span>
            <input name="invoice_number" maxLength={100} className="input mt-1" />
          </label>
          <label className="text-sm">
            <span className="field-label">Total, GBP (optional)</span>
            <input name="amount_gbp" type="number" min={0} step="0.01" className="input mt-1" />
          </label>
          <label className="text-sm">
            <span className="field-label">Note (optional)</span>
            <input name="note" maxLength={1000} className="input mt-1" />
          </label>
          <div className="sm:col-span-3">
            <FileDrop
              name="file"
              accept={INVOICE_ACCEPT}
              allowedTypes={INVOICE_TYPES}
              preview={false}
              hint={INVOICE_HINT}
              label="Drag your invoice here, or click to browse"
            />
          </div>
          <div className="sm:col-span-3">
            <GhostSubmit label="Upload invoice" pending="Uploading…" />
            <Notice state={state} />
          </div>
        </form>

        {invoices.length > 0 && (
          <ul className="mt-4 space-y-2">
            {invoices.map((inv, i) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm"
              >
                <span>
                  {inv.href ? (
                    <a href={inv.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-brand-dark)]">
                      {inv.file_name ?? "Invoice"}
                    </a>
                  ) : (
                    inv.file_name ?? "Invoice"
                  )}
                  {inv.invoice_number ? ` · ${inv.invoice_number}` : ""}
                  {inv.amount_gbp != null ? ` · £${Number(inv.amount_gbp).toLocaleString("en-GB")}` : ""}
                  {i === 0 && invoices.length > 1 ? " · latest" : ""}
                  <span className="block text-xs text-[var(--color-ink-soft)]">
                    {new Date(inv.created_at).toLocaleString("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/London",
                    })}
                    {inv.review_note ? ` · ${inv.review_note}` : ""}
                  </span>
                </span>
                <span className="rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink-soft)]">
                  {INVOICE_STATUS_LABELS[inv.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
          Replacing an invoice? Upload the new one — the earlier ones stay on file and the latest is the one that counts.
        </p>
      </div>
    </div>
  );
}

/** The final consent. Submitting takes the event live. */
export function FinalConsentSection({
  eventId,
  live,
  reconfirm,
  ready,
  blockedBy,
  consentedAt,
}: {
  eventId: string;
  live: boolean;
  /** A live event whose consent the team's edit reset. */
  reconfirm: boolean;
  /** Every earlier step is done. */
  ready: boolean;
  blockedBy: string[];
  consentedAt: string | null;
}) {
  const [state, action] = useActionState<FulfilmentActionState, FormData>(submitFulfilment, {});
  // A live event asks again only after a team edit reset the consent.
  const needsConfirm = !live || reconfirm;
  return (
    <div id="final-consent" className="card p-6">
      <h2 className="text-lg font-semibold">Final consent</h2>
      {!needsConfirm ? (
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          You agreed to the Terms &amp; Conditions and Privacy Policy on{" "}
          {new Date(consentedAt!).toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Europe/London",
          })}
          .
        </p>
      ) : (
        <form action={action} className="mt-3">
          <input type="hidden" name="event_id" value={eventId} />
          {!ready && blockedBy.length > 0 && (
            <p className="mb-3 rounded-lg bg-[var(--color-mist)] px-3 py-2 text-sm text-[var(--color-ink-soft)]">
              Still to do: {blockedBy.join(" · ")}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-1" disabled={!ready} />
            <span>
              I/We agree to the{" "}
              <a href="/terms#artist" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-brand-dark)]">
                Terms &amp; Conditions
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-brand-dark)]">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          <Notice state={state} />
          <div className="mt-3">
            <Submit label={live ? "Confirm again" : "Submit — take my event live"} pending="Submitting…" disabled={!ready} />
          </div>
        </form>
      )}
    </div>
  );
}
