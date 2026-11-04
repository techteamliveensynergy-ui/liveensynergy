import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import {
  INVOICE_STATUS_LABELS,
  PROMO_CHANNEL_PRESETS,
  WAITING_FOR_FULFILMENT,
  hasPromo,
  invoiceRequired,
  type ArtistInvoice,
  type SponsoredEventFulfilment,
} from "@/lib/fulfilment";
import { formatDateTime } from "@/lib/format";
import { reviewArtistInvoice, saveFulfilmentTerms, setFulfilmentState } from "../../../fulfilment-actions";

const COMPLETION_LABELS: Record<string, string> = {
  artist: "completed by the artist",
  admin_waived: "put live by the team",
  predates: "live before the form existed",
};

function Pill({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        done ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" : "bg-[var(--color-mist)] text-[var(--color-ink-soft)]"
      }`}
    >
      {done ? "✓ " : ""}
      {children}
    </span>
  );
}

function Notice({ notice, message }: { notice?: string; message?: string }) {
  if (notice === "fulfilment_error") {
    return (
      <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-sm text-[var(--color-accent)]">
        {message || "Something went wrong."}
      </p>
    );
  }
  const text: Record<string, string> = {
    fulfilment_saved: "✓ Saved.",
    fulfilment_saved_reset: "✓ Saved. The artist had already confirmed — they've been asked to confirm the updated terms.",
    invoice_reviewed: "✓ Invoice updated.",
    fulfilment_waived: "✓ The event is live without the artist's form. It's on the audit log.",
    fulfilment_reopened: "The event is back to waiting for fulfilment; the artist will need to confirm again.",
  };
  if (!notice || !text[notice]) return null;
  return <p className="mt-3 rounded-lg bg-[var(--color-sage)] px-3 py-2 text-sm text-[var(--color-olive-deep)]">{text[notice]}</p>;
}

/**
 * The artist fulfilment form, from the team's side (#57/#59, 0103): what the
 * artist is asked to agree, their invoices, and the go-live overrides.
 */
export function FulfilmentAdminSection({
  eventId,
  eventStatus,
  eventDate,
  hasArtist,
  artistFeeGbp,
  codesConfirmed,
  hasTiers,
  fulfilment: f,
  invoices,
  notice,
  message,
}: {
  eventId: string;
  eventStatus: string;
  eventDate: string | null;
  hasArtist: boolean;
  artistFeeGbp: number | null;
  codesConfirmed: boolean;
  hasTiers: boolean;
  fulfilment: SponsoredEventFulfilment | null;
  invoices: (ArtistInvoice & { href: string | null })[];
  notice?: string;
  message?: string;
}) {
  const live = !!f?.completed_at;
  const promo = hasPromo(f);
  const invNeeded = invoiceRequired({ artist_fee_gbp: artistFeeGbp }, f);
  const presetSet = new Set<string>(PROMO_CHANNEL_PRESETS);
  const extras = (f?.promo_channels ?? []).filter((c) => !presetSet.has(c));

  return (
    <div id="fulfilment" className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Artist fulfilment form</h2>
        {eventStatus === "confirmed" || eventStatus === "completed" ? (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              live ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" : "bg-[var(--color-gold)] text-[var(--color-ink)]"
            }`}
          >
            {live ? "Live" : WAITING_FOR_FULFILMENT}
          </span>
        ) : (
          <span className="text-sm text-[var(--color-ink-soft)]">Opens when the partnership is confirmed</span>
        )}
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        The event goes public and opens to the audience only once the artist completes this form (or you put it live
        below).{" "}
        {live && f?.completion_kind && <>It was {COMPLETION_LABELS[f.completion_kind]}{f.completed_at ? ` · ${formatDateTime(f.completed_at)}` : ""}.</>}
      </p>
      {live && f?.completion_kind === "admin_waived" && f.waived_reason && (
        <p className="mt-1 text-sm">Reason: {f.waived_reason}</p>
      )}

      <Notice notice={notice} message={message} />

      {!hasArtist && (
        <p className="mt-3 rounded-lg bg-[var(--color-gold)]/50 px-3 py-2 text-sm">
          This partnership has no artist attached, so nobody can complete the form — put it live below if it should be.
        </p>
      )}

      {f && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Artist progress">
          <Pill done={codesConfirmed && hasTiers}>Discount codes confirmed</Pill>
          <Pill done={promo ? !!f.promo_consent_at : true}>{promo ? "Promotional commitments confirmed" : "No promotional commitments set"}</Pill>
          <Pill done={invNeeded ? invoices.some((i) => i.status !== "rejected") : true}>
            {invNeeded ? "Invoice uploaded" : "No invoice needed"}
          </Pill>
          <Pill done={!!f.final_consent_at}>Final consent given</Pill>
        </div>
      )}

      {/* ---- Terms the artist is asked to agree ---- */}
      <form action={saveFulfilmentTerms} className="mt-6 grid gap-4">
        <input type="hidden" name="event_id" value={eventId} />
        <p className="text-xs text-[var(--color-ink-soft)]">
          Saving a change to the commitments or payment terms clears the artist&apos;s confirmation, so they agree the
          version they&apos;ve actually read — they&apos;re notified. A live event stays live.
        </p>

        <fieldset>
          <legend className="field-label">Agreed promotional channels</legend>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {PROMO_CHANNEL_PRESETS.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="channel_preset" value={c} defaultChecked={f?.promo_channels.includes(c)} />
                {c}
              </label>
            ))}
          </div>
          <label className="mt-3 block text-sm">
            <span className="field-label">Other agreed channels — one name per line</span>
            <textarea
              name="channel_extra"
              rows={3}
              className="textarea mt-1"
              placeholder={"YouTube Shorts\nPodcast mention"}
              defaultValue={extras.join("\n")}
            />
          </label>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="field-label">Number of agreed posts</span>
            <input name="promo_post_count" type="number" min={0} max={1000} className="input mt-1" placeholder="e.g. 2" defaultValue={f?.promo_post_count ?? ""} />
          </label>
          <label className="text-sm">
            <span className="field-label">
              Promotion start date{eventDate ? ` (event is ${eventDate})` : ""}
            </span>
            <input name="promo_start_date" type="date" max={eventDate ?? undefined} className="input mt-1" defaultValue={f?.promo_start_date ?? ""} />
          </label>
        </div>

        <label className="text-sm">
          <span className="field-label">Social media handles / URLs — one per line</span>
          <textarea name="promo_urls" rows={3} className="textarea mt-1" placeholder="@artistname&#10;instagram.com/artistname" defaultValue={(f?.promo_urls ?? []).join("\n")} />
        </label>
        <label className="text-sm">
          <span className="field-label">Social media post texts</span>
          <textarea name="promo_post_texts" rows={4} className="textarea mt-1" defaultValue={f?.promo_post_texts ?? ""} />
        </label>
        <label className="text-sm">
          <span className="field-label">Other promotional requirements</span>
          <textarea name="promo_other" rows={3} className="textarea mt-1" placeholder="Timing, formats, tagging, pinned links, story duration, etc." defaultValue={f?.promo_other ?? ""} />
        </label>
        <label className="text-sm">
          <span className="field-label">Any other special terms</span>
          <textarea name="special_terms" rows={3} className="textarea mt-1" defaultValue={f?.special_terms ?? ""} />
        </label>

        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <label className="text-sm">
            <span className="field-label">Proof of social media (what the artist must upload afterwards)</span>
            <textarea name="proof_requirements" rows={3} className="textarea mt-1" placeholder="e.g. a screenshot of each post showing the date, plus the post's insights after 7 days" defaultValue={f?.proof_requirements ?? ""} />
          </label>
          <label className="text-sm">
            <span className="field-label">Minimum uploads</span>
            <input name="proof_min_count" type="number" min={0} max={1000} className="input mt-1" defaultValue={f?.proof_min_count ?? ""} />
          </label>
        </div>

        <label className="text-sm">
          <span className="field-label">Terms of payment to the artist / organiser</span>
          <textarea name="payment_terms" rows={4} className="textarea mt-1" placeholder="When and how they're paid, and any conditions. Leave empty if there's nothing to pay." defaultValue={f?.payment_terms ?? ""} />
          <span className="field-hint">
            Once there&apos;s a fee on the event or payment terms here, the artist must upload an invoice before submitting.
          </span>
        </label>

        <div className="flex justify-end">
          <button type="submit" className="btn btn-ghost">
            Save fulfilment terms
          </button>
        </div>
      </form>

      {/* ---- Invoices ---- */}
      <div className="mt-8 border-t border-black/10 pt-5">
        <h3 className="font-semibold">Artist invoices</h3>
        {invoices.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            None uploaded yet.{invNeeded ? " One is required before the artist can submit." : ""}
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {invoices.map((inv, i) => (
              <li key={inv.id} className="rounded-xl border border-black/10 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {inv.href ? (
                      <a href={inv.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-brand-dark)]">
                        {inv.file_name ?? "Invoice"} ↗
                      </a>
                    ) : (
                      <span className="font-semibold">{inv.file_name ?? "Invoice"}</span>
                    )}
                    {inv.invoice_number ? ` · ${inv.invoice_number}` : ""}
                    {inv.amount_gbp != null ? ` · £${Number(inv.amount_gbp).toLocaleString("en-GB")}` : ""}
                    {i === 0 && invoices.length > 1 ? " · latest" : ""}
                    <span className="block text-xs text-[var(--color-ink-soft)]">
                      Uploaded {formatDateTime(inv.created_at)}
                      {inv.note ? ` · “${inv.note}”` : ""}
                    </span>
                  </span>
                  <span className="rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink-soft)]">
                    {INVOICE_STATUS_LABELS[inv.status]}
                  </span>
                </div>
                <form action={reviewArtistInvoice} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="event_id" value={eventId} />
                  <input type="hidden" name="invoice_id" value={inv.id} />
                  <select name="status" className="select w-auto" defaultValue={inv.status}>
                    {(Object.keys(INVOICE_STATUS_LABELS) as (keyof typeof INVOICE_STATUS_LABELS)[]).map((s) => (
                      <option key={s} value={s}>
                        {INVOICE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <input name="review_note" maxLength={1000} className="input w-auto min-w-[12rem] flex-1" placeholder="Note to keep (optional)" defaultValue={inv.review_note ?? ""} />
                  <button type="submit" className="btn btn-ghost text-sm">
                    Update
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- Overrides ---- */}
      {(eventStatus === "confirmed" || eventStatus === "completed") && (
        <div className="mt-8 border-t border-black/10 pt-5">
          <h3 className="font-semibold">Go-live override</h3>
          {live ? (
            <form action={setFulfilmentState} className="mt-2">
              <input type="hidden" name="event_id" value={eventId} />
              <input type="hidden" name="action" value="reopen" />
              <p className="text-sm text-[var(--color-ink-soft)]">
                Take the event back to &ldquo;{WAITING_FOR_FULFILMENT}&rdquo;: it leaves the public site and closes to new
                registrations (people already registered keep their place). The artist&apos;s final consent is cleared.
              </p>
              <div className="mt-3">
                <ConfirmSubmit
                  label="Reopen the form"
                  pendingLabel="Reopening…"
                  title="Take this event offline?"
                  body={<>The event stops being public until the artist completes the form again, or you put it live.</>}
                  confirmLabel="Yes, reopen it"
                  danger
                />
              </div>
            </form>
          ) : (
            <form action={setFulfilmentState} className="mt-2 flex flex-wrap items-end gap-3">
              <input type="hidden" name="event_id" value={eventId} />
              <input type="hidden" name="action" value="waive" />
              <label className="min-w-[16rem] flex-1 text-sm">
                <span className="field-label">Put it live without the artist&apos;s form — reason (kept on the audit log)</span>
                <input name="reason" required minLength={3} maxLength={1000} className="input mt-1" placeholder="e.g. Artist agreed everything by email" />
              </label>
              <button type="submit" className="btn btn-ghost">
                Put live
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
