import Link from "next/link";
import type { Invoice } from "@/lib/types";

export function InvoiceSection({
  eventId,
  invoices,
}: {
  eventId: string;
  invoices: Invoice[];
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
