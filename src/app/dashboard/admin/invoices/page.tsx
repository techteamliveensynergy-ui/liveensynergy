import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import {
  daysOverdue,
  formatGbp,
  invoiceDisplayStatus,
  ukToday,
  type InvoiceDisplayStatus,
} from "@/lib/billing";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Invoices · Admin" };

type Row = Invoice & { brands: { brand_name: string } | null };

/** "unpaid" means still expecting money: unpaid (not yet due) + overdue. */
const FILTERS: { key: "all" | "unpaid" | InvoiceDisplayStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "unpaid", label: "Unpaid" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "cancelled", label: "Cancelled" },
];

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireRole(["admin"]);
  const { status: filter = "all" } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("*, brands(brand_name)")
    .order("created_at", { ascending: false });

  const today = ukToday();
  const all = ((data ?? []) as Row[]).map((inv) => ({
    inv,
    shown: invoiceDisplayStatus(inv, today),
  }));
  const matches = (key: string, shown: InvoiceDisplayStatus) =>
    key === "all" || (key === "unpaid" ? shown === "unpaid" || shown === "overdue" : shown === key);
  const count = (key: string) => all.filter((r) => matches(key, r.shown)).length;
  const rows = all.filter((r) => matches(filter, r.shown));

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Every sponsor invoice and where it stands. Unpaid ones can be resent to the brand."
        action={
          <Link href="/dashboard/admin/invoices/new" className="btn btn-primary">
            + New invoice
          </Link>
        }
      />

      {all.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/dashboard/admin/invoices" : `/dashboard/admin/invoices?status=${f.key}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                filter === f.key
                  ? "bg-[var(--color-brand)] text-white"
                  : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
              }`}
            >
              {f.label} ({count(f.key)})
            </Link>
          ))}
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No invoices yet"
          body="Campaigns draft their own invoices; you can also start one here."
          cta={{ href: "/dashboard/admin/invoices/new", label: "Create an invoice" }}
        />
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No invoices match this filter.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ inv, shown }) => {
            const late = shown === "overdue" ? daysOverdue(inv.due_date, today) : 0;
            return (
              <Link
                key={inv.id}
                href={`/dashboard/admin/invoices/${inv.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 p-5 transition hover:bg-[var(--color-mist)]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--color-ink)]">
                      {inv.brands?.brand_name ?? "Unknown brand"}
                    </span>
                    <StatusBadge status={shown} />
                    {late > 0 && (
                      <span className="text-xs font-semibold text-[var(--color-accent)]">
                        {late} day{late === 1 ? "" : "s"} overdue
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    Ref {inv.reference} · {formatGbp(inv.amount_gbp)}
                    {inv.vat_gbp != null ? " inc. VAT" : ""}
                    {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}
                    {inv.resend_count > 0 && inv.last_resent_at
                      ? ` · resent ${inv.resend_count}× (last ${formatDateTime(inv.last_resent_at)})`
                      : ""}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
