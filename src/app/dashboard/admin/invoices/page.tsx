import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { Invoice } from "@/lib/types";

export const metadata = { title: "Invoices · Admin" };

type Row = Invoice & { brands: { brand_name: string } | null };

export default async function AdminInvoicesPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("*, brands(brand_name)")
    .order("created_at", { ascending: false });
  const invoices = (data ?? []) as Row[];

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Sponsor invoices — bank transfer against a reference, no on-platform payment collection."
        action={
          <Link href="/dashboard/admin/invoices/new" className="btn btn-primary">
            + New invoice
          </Link>
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No invoices yet"
          body="Draft one from a sponsored event, or start here."
          cta={{ href: "/dashboard/admin/invoices/new", label: "Create an invoice" }}
        />
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
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
                  <StatusBadge status={inv.status} />
                </div>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                  Ref {inv.reference} · £{Number(inv.amount_gbp).toLocaleString("en-GB")}
                  {inv.due_date ? ` · due ${inv.due_date}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
