import { formatDateTime } from "@/lib/format";
import {
  ACCOUNT_CONSENTS,
  CONSENT_LABELS,
  CONSENT_SOURCE_LABELS,
  consentSubject,
  currentConsents,
} from "@/lib/consents";
import type { ConsentRecord } from "@/lib/types";

/**
 * Read-only consent log for one person (0080). Records are written by
 * database triggers where each consent is given and can't be edited or
 * deleted by anyone, admins included — so this section has no controls.
 */
export function ConsentsSection({ records, isAudience }: { records: ConsentRecord[]; isAudience: boolean }) {
  const current = currentConsents(records);
  const account = (type: ConsentRecord["consent_type"]) =>
    current.find((r) => r.consent_type === type && r.granted) ?? null;
  const marketing = current.filter((r) => r.consent_type === "sponsor_marketing");
  const marketingOn = marketing.filter((r) => r.granted);

  const cards = [
    ...ACCOUNT_CONSENTS.map((type) => {
      const r = account(type);
      return {
        label: CONSENT_LABELS[type],
        value: r ? formatDateTime(r.recorded_at) : "Not recorded",
        detail: r ? [r.version && `v${r.version}`, CONSENT_SOURCE_LABELS[r.source]].filter(Boolean).join(" · ") : null,
      };
    }),
    // Asked of audience members only, per event, once they're selected.
    ...(isAudience
      ? [
          {
            label: CONSENT_LABELS.sponsor_marketing,
            value: marketing.length === 0 ? "Never asked" : `Opted in for ${marketingOn.length} of ${marketing.length}`,
            detail: marketing.length ? "per event, see history" : null,
          },
        ]
      : []),
    {
      label: "Live·En·Synergy marketing emails",
      value: "Not collected",
      detail: "No opt-in is asked for yet",
    },
  ];

  return (
    <section data-testid="consents-section">
      <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Consents &amp; legal</h2>
      <p className="mb-3 mt-1 text-sm text-[var(--color-ink-soft)]">
        Recorded automatically each time this person gives or withdraws a consent. Read-only — nobody can change
        or delete these records.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 shadow-sm">
            <p className="text-xs text-[var(--color-ink-soft)]">{c.label}</p>
            <p className="mt-1 font-display text-base font-semibold text-[var(--color-ink)]">{c.value}</p>
            {c.detail && <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{c.detail}</p>}
          </div>
        ))}
      </div>

      <div className="card mt-4 overflow-x-auto p-0">
        {records.length === 0 ? (
          <p className="p-6 text-sm text-[var(--color-ink-soft)]">No consent records for this person.</p>
        ) : (
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-black/10 text-xs text-[var(--color-ink-soft)]">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Consent</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Where</th>
                <th className="px-4 py-2.5 font-medium">About</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-black/5 last:border-0" data-testid="consent-row">
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {r.context?.approximate_time ? "≈ " : ""}
                    {formatDateTime(r.recorded_at)}
                  </td>
                  <td className="px-4 py-2.5">{CONSENT_LABELS[r.consent_type] ?? r.consent_type}</td>
                  <td className="px-4 py-2.5">
                    {r.granted ? (
                      <span className="rounded-full bg-[var(--color-sage)] px-2 py-0.5 text-xs font-medium text-[var(--color-olive-deep)]">
                        {r.consent_type === "email_verified" ? "Verified" : "Given"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--color-pink)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
                        {r.source === "my_events" ? "Withdrawn" : "Not given"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{CONSENT_SOURCE_LABELS[r.source] ?? r.source}</td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-soft)]">{consentSubject(r) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[var(--color-ink-soft)]">{r.version ? `v${r.version}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {records.some((r) => r.backfilled) && (
        <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
          Consents given before 17 Oct 2026 were rebuilt from the original sign-up, registration, survey and order-form
          records. “≈” marks a newsletter opt-in whose exact time wasn&apos;t kept.
        </p>
      )}
    </section>
  );
}
