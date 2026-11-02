import { formatDateTime } from "@/lib/format";
import {
  FULFILMENT_STAGE_LABEL,
  fulfilmentStage,
  type FulfilmentForm,
  type FulfilmentPrefill,
} from "@/lib/fulfilment";
import { markFulfilmentReady, saveFulfilmentForm } from "../../../fulfilment-actions";

/**
 * The team fills in the Artist/Organiser Fulfilment Form here (0104). The
 * artist sees it read-only once it's marked ready, and gives their final
 * consent on their partnership page.
 */
export function FulfilmentFormSection({
  eventId,
  form,
  prefill,
  hasArtist,
  notice,
  errorMessage,
}: {
  eventId: string;
  form: FulfilmentForm | null;
  prefill: FulfilmentPrefill | null;
  hasArtist: boolean;
  notice?: string;
  errorMessage?: string;
}) {
  const stage = fulfilmentStage(form);
  // Before anything is saved, suggest what the brand's order form says.
  const suggest = !form && prefill;

  return (
    <section id="fulfilment" className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Artist fulfilment form</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Filled in by the team, read-only for the artist. They see it once it&apos;s marked ready, and their
            final consent is their agreement to the partnership.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            stage === "consented"
              ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
              : stage === "ready"
                ? "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]"
                : "bg-[var(--color-gold)] text-[var(--color-ink)]"
          }`}
        >
          {FULFILMENT_STAGE_LABEL[stage]}
        </span>
      </div>

      {form?.ready_at && (
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
          Sent {formatDateTime(form.ready_at)}
          {form.artist_ack_at ? ` · artist consented ${formatDateTime(form.artist_ack_at)}` : ""}
        </p>
      )}

      {notice === "fulfilment_saved" && <Banner tone="ok">Saved.</Banner>}
      {notice === "fulfilment_saved_cleared" && (
        <Banner tone="ok">Saved. The artist&apos;s consent was cleared and they&apos;ve been asked to consent again.</Banner>
      )}
      {notice === "fulfilment_ready" && (
        <Banner tone="ok">Sent to the artist. They and the team have been notified, and the codes deadline now counts from today.</Banner>
      )}
      {notice === "fulfilment_error" && <Banner tone="error">{errorMessage || "Couldn't save the form."}</Banner>}

      {suggest && (prefill.social_media_details || prefill.other_details || prefill.campaign_timeline) && (
        <div className="mt-4 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm">
          <p className="font-semibold text-[var(--color-ink)]">From the brand&apos;s order form</p>
          {prefill.social_media_details && (
            <p className="mt-1 whitespace-pre-line text-[var(--color-ink-soft)]">
              <span className="font-medium text-[var(--color-ink)]">Social media: </span>
              {prefill.social_media_details}
            </p>
          )}
          {prefill.campaign_timeline && (
            <p className="mt-1 text-[var(--color-ink-soft)]">
              <span className="font-medium text-[var(--color-ink)]">Timeline: </span>
              {prefill.campaign_timeline}
            </p>
          )}
          {prefill.other_details && (
            <p className="mt-1 whitespace-pre-line text-[var(--color-ink-soft)]">
              <span className="font-medium text-[var(--color-ink)]">Other: </span>
              {prefill.other_details}
            </p>
          )}
        </div>
      )}

      <form action={saveFulfilmentForm} className="mt-5 grid gap-4">
        <input type="hidden" name="event_id" value={eventId} />

        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Promotional commitments
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Agreed promotional channels" hint="One per line, e.g. Instagram @act, TikTok @act.">
            <textarea
              name="promo_channels"
              className="textarea"
              rows={3}
              defaultValue={form?.promo_channels.join("\n") ?? ""}
            />
          </Field>
          <Field label="Social media URLs" hint="The brand's handles or pages to tag. One per line.">
            <textarea
              name="promo_social_urls"
              className="textarea"
              rows={3}
              defaultValue={form?.promo_social_urls.join("\n") ?? ""}
            />
          </Field>
          <Field label="Number of agreed posts">
            <input
              name="promo_post_count"
              type="number"
              min={0}
              className="input"
              defaultValue={form?.promo_post_count ?? ""}
            />
          </Field>
          <Field label="Promotion start date">
            <input name="promo_start_date" type="date" className="input" defaultValue={form?.promo_start_date ?? ""} />
          </Field>
        </div>
        <Field
          label="Social media post texts"
          hint='The copy to post. Separate posts with a line containing only "---".'
        >
          <textarea
            name="promo_post_texts"
            className="textarea"
            rows={5}
            defaultValue={form?.promo_post_texts.join("\n---\n") ?? ""}
          />
        </Field>
        <Field label="Other promotional requirements">
          <textarea
            name="promo_other"
            className="textarea"
            rows={3}
            defaultValue={form?.promo_other ?? (suggest ? prefill.other_details ?? "" : "")}
          />
        </Field>

        <h3 className="mt-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Any other special terms
        </h3>
        <Field label="Special terms">
          <textarea name="special_terms" className="textarea" rows={3} defaultValue={form?.special_terms ?? ""} />
        </Field>

        {form?.artist_ack_at && (
          <p className="text-xs text-[var(--color-ink-soft)]">
            Saving changes clears the artist&apos;s consent and asks them to consent again.
          </p>
        )}
        <div className="flex justify-end">
          <button type="submit" className="btn btn-ghost">
            Save form
          </button>
        </div>
      </form>

      {form && !form.ready_at && (
        <form action={markFulfilmentReady} className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-black/5 pt-4">
          <input type="hidden" name="event_id" value={eventId} />
          <p className="text-xs text-[var(--color-ink-soft)]">
            {hasArtist
              ? "Needs channels, number of posts and a start date. Starts the one-week codes deadline."
              : "No artist on this partnership yet."}
          </p>
          <button type="submit" className="btn btn-primary" disabled={!hasArtist}>
            Mark ready &amp; send to artist
          </button>
        </form>
      )}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      className={`mt-4 rounded-lg px-4 py-3 text-sm ${
        tone === "ok"
          ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]"
          : "bg-[var(--color-pink)] text-[var(--color-ink)]"
      }`}
    >
      {children}
    </p>
  );
}
