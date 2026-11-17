import Link from "next/link";
import type { Invoice } from "@/lib/types";

/** What the artist did about their own invoice (0121). */
export interface ArtistInvoiceInfo {
  files: { id: string; title: string; file_name: string; href: string | null }[];
  draftRequested: boolean;
}

export function InvoiceSection({
  eventId,
  invoices,
  artistInvoice,
}: {
  eventId: string;
  invoices: Invoice[];
  artistInvoice?: ArtistInvoiceInfo;
}) {
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          Invoicing
        </h2>
        <Link
          href={`/dashboard/admin/invoices/new?sponsored_event_id=${eventId}`}
          className="btn btn-ghost text-sm"
        >
          Draft invoice
        </Link>
      </div>
      {artistInvoice && (artistInvoice.draftRequested || artistInvoice.files.length > 0) && (
        <div className="mt-3 rounded-xl bg-[var(--color-mist)] p-3 text-sm">
          <p className="font-semibold">The artist&apos;s invoice</p>
          {artistInvoice.draftRequested && (
            <p className="mt-1 text-[var(--color-ink-soft)]">
              The artist asked the team to draft their invoice — use &ldquo;Draft invoice&rdquo; above.
            </p>
          )}
          {artistInvoice.files.map((f) => (
            <p key={f.id} className="mt-1">
              {f.title} <span className="text-xs text-[var(--color-ink-soft)]">· {f.file_name}</span>{" "}
              {f.href && (
                <a href={f.href} className="font-semibold text-[var(--color-brand-dark)] underline">
                  Download
                </a>
              )}
            </p>
          ))}
        </div>
      )}
      {invoices.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          No invoices drafted for this event yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              href={`/dashboard/admin/invoices/${inv.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm transition hover:bg-[var(--color-mist)]"
            >
              <span>{inv.reference} · £{Number(inv.amount_gbp).toLocaleString("en-GB")}</span>
              <span className="rounded-full bg-[var(--color-mist)] px-2 py-0.5 text-[11px] font-semibold capitalize text-[var(--color-ink-soft)]">
                {inv.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
