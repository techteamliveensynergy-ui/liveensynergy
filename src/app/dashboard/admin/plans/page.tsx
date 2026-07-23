import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import type { Plan } from "@/lib/types";
import { togglePlanActive } from "../actions";

export const metadata = { title: "Plans · Admin" };

export default async function AdminPlansPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("*").order("sort_order");
  const plans = (data ?? []) as Plan[];

  return (
    <div>
      <PageHeader
        title="Plans"
        subtitle="Create and manage subscription tiers, then assign them to users."
        action={
          <Link href="/dashboard/admin/plans/new" className="btn btn-primary">
            + New plan
          </Link>
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          icon="💳"
          title="No plans yet"
          body="Create your first subscription plan."
          cta={{ href: "/dashboard/admin/plans/new", label: "Create a plan" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="card flex flex-col p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.name}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.is_active ? "bg-[var(--color-sage)] text-[var(--color-olive-deep)]" : "bg-[var(--color-mint)] text-[var(--color-ink-soft)]"}`}
                >
                  {p.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="mt-1 text-2xl font-bold">
                {p.price_gbp > 0 ? `£${p.price_gbp}` : "Free"}
                {p.price_gbp > 0 && (
                  <span className="text-sm font-normal text-[var(--color-ink-soft)]">
                    /{p.billing_interval}
                  </span>
                )}
              </p>
              {p.description && (
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                  {p.description}
                </p>
              )}
              {p.features && (
                <ul className="mt-3 space-y-1 text-sm text-[var(--color-ink-soft)]">
                  {p.features.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex items-center gap-2 border-t border-black/10 pt-3">
                <Link
                  href={`/dashboard/admin/plans/${p.id}`}
                  className="btn btn-ghost text-sm"
                >
                  Edit
                </Link>
                <form action={togglePlanActive}>
                  <input type="hidden" name="id" value={p.id} />
                  <input
                    type="hidden"
                    name="next"
                    value={(!p.is_active).toString()}
                  />
                  <button type="submit" className="btn btn-ghost text-sm">
                    {p.is_active ? "Deactivate" : "Activate"}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
