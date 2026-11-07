import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { formatDate, formatDateTime } from "@/lib/format";
import { FULFILMENT_CONSENTS, type FulfilmentForm } from "@/lib/fulfilment";
import { giveFulfilmentConsent } from "../actions";

/**
 * The artist's read-only view of the fulfilment form (0104): promotional
 * commitments and any other special terms, filled in by the team. Until the
 * team marks it ready the artist sees a placeholder.
 *
 * One card titled "Fulfilment form" with its status (sent when, consented when)
 * — QA 6 Nov: the same content as separate "Promotional commitments" / "special
 * terms" cards read as the brief, and the tester couldn't find "the form" the
 * admin said she had consented to.
 */
export function FulfilmentCards({ form }: { form: FulfilmentForm | null }) {
  if (!form) {
    return (
      <div id="fulfilment" className="card p-6">
        <h2 className="text-lg font-semibold">Fulfilment form</h2>
        <p className="mt-2 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          Your fulfilment form is being prepared by the Live·En·Synergy team. We&apos;ll let you know in the app and
          by email as soon as it&apos;s ready to review.
        </p>
      </div>
    );
  }

  return (
    <>
      <div id="fulfilment" className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Fulfilment form</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
              Filled in by the Live·En·Synergy team from what was agreed with the brand
              {form.ready_at ? ` · sent ${formatDateTime(form.ready_at)}` : ""}. Contact the team if anything looks
              wrong.
            </p>
          </div>
          <span
            className={`chip ${form.artist_ack_at ? "bg-[var(--color-sage)]" : "bg-[var(--color-gold)]"}`}
            data-testid="fulfilment-status"
          >
            {form.artist_ack_at ? `Consent given ${formatDateTime(form.artist_ack_at)}` : "Waiting for your consent"}
          </span>
        </div>

        <h3 className="mt-6 text-base font-semibold">Promotional commitments</h3>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Item label="Agreed promotional channels">
            <List items={form.promo_channels} />
          </Item>
          <Item label="Number of agreed posts">{form.promo_post_count ?? "—"}</Item>
          <Item label="Social media URLs to tag">
            <List items={form.promo_social_urls} links />
          </Item>
          <Item label="Promotion start date">
            {form.promo_start_date ? formatDate(form.promo_start_date) : "—"}
          </Item>
        </dl>
        {form.promo_post_texts.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
              Social media post texts
            </p>
            <ol className="mt-2 space-y-2">
              {form.promo_post_texts.map((t, i) => (
                <li
                  key={i}
                  className="whitespace-pre-wrap rounded-lg border border-black/10 px-4 py-3 text-sm text-[var(--color-ink)]"
                >
                  <span className="mb-1 block text-xs font-semibold text-[var(--color-ink-soft)]">Post {i + 1}</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        )}
        {form.promo_other && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
              Other promotional requirements
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink)]">{form.promo_other}</p>
          </div>
        )}

        <h3 className="mt-6 text-base font-semibold">Any other special terms</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-ink)]">
          {form.special_terms || "None."}
        </p>
      </div>
    </>
  );
}

/**
 * The artist's final consent: two ticks, then the same "can't be undone"
 * confirmation the old "I agree" button had. It records the consent and the
 * artist's agreement to the partnership together.
 */
export function FulfilmentConsent({
  eventId,
  eventName,
  form,
  brandAgreed,
  artistAgreed,
  alreadyConfirmed = false,
}: {
  eventId: string;
  eventName: string;
  form: FulfilmentForm | null;
  brandAgreed: boolean;
  artistAgreed: boolean;
  /** The partnership is already confirmed: consenting records it but changes nothing else. */
  alreadyConfirmed?: boolean;
}) {
  if (form?.artist_ack_at) {
    return (
      <p className="mt-4 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
        You gave your consent on {formatDateTime(form.artist_ack_at)}.
      </p>
    );
  }
  if (!form) {
    return (
      <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
        You&apos;ll give your consent here once the team has sent you the fulfilment form.
      </p>
    );
  }

  return (
    <form action={giveFulfilmentConsent} className="mt-4 space-y-3">
      <input type="hidden" name="id" value={eventId} />
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="consent_commitments" required className="mt-0.5 h-4 w-4" />
        <span>{FULFILMENT_CONSENTS.commitments}</span>
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="consent_terms" required className="mt-0.5 h-4 w-4" />
        <span>
          I/We agree to the{" "}
          <a href="/terms#artist" target="_blank" rel="noopener noreferrer" className="underline">
            Terms and Conditions
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      <ConfirmSubmit
        label="Give my consent"
        pendingLabel="Recording…"
        title={!alreadyConfirmed && brandAgreed && !artistAgreed ? "Confirm this partnership?" : "Give your consent?"}
        body={
          alreadyConfirmed ? (
            <>
              You&apos;re consenting to the fulfilment form for <strong>{eventName}</strong> as it stands. The
              partnership is already confirmed, so this only records your consent. Changing anything afterwards
              means contacting the Live·En·Synergy team.
            </>
          ) : brandAgreed && !artistAgreed ? (
            <>
              The brand has already agreed, so this confirms <strong>{eventName}</strong> immediately.{" "}
              <strong>This can&apos;t be undone</strong>. Changing anything afterwards means contacting the
              Live·En·Synergy team.
            </>
          ) : (
            <>
              You&apos;re consenting to the fulfilment form for <strong>{eventName}</strong> as it stands. The
              partnership confirms as soon as the brand agrees too, and confirmation can&apos;t be undone.
            </>
          )
        }
        confirmLabel={!alreadyConfirmed && brandAgreed && !artistAgreed ? "Yes, confirm it" : "Yes, I consent"}
        danger={!alreadyConfirmed && brandAgreed && !artistAgreed}
      />
    </form>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-1 text-sm text-[var(--color-ink)]">{children}</dd>
    </div>
  );
}

function List({ items, links = false }: { items: string[]; links?: boolean }) {
  if (items.length === 0) return <>—</>;
  return (
    <ul className="space-y-0.5">
      {items.map((v) => (
        <li key={v}>
          {links && /^https?:\/\//i.test(v) ? (
            <a href={v} target="_blank" rel="noopener noreferrer" className="underline">
              {v}
            </a>
          ) : (
            v
          )}
        </li>
      ))}
    </ul>
  );
}
