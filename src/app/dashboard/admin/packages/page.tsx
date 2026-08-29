import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/dashboard/ui";
import type { CampaignPackage } from "@/lib/types";
import { togglePackageActive } from "../actions";

export const metadata = { title: "Packages · Admin" };

export default async function AdminPackagesPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaign_packages")
    .select("*")
    .order("sort_order");
  const packages = (data ?? []) as CampaignPackage[];

  return (
    <div>
      <PageHeader
        title="Packages"
        subtitle="Manage campaign tiers, their price, and the platform margin each one carries."
        action={
          <Link href="/dashboard/admin/packages/new" className="btn btn-primary">
            + New package
          </Link>
        }
      />

      {packages.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No packages yet"
          body="Create the Starter/Growth/Premium tiers brands pick from."
          cta={{ href: "/dashboard/admin/packages/new", label: "Create a package" }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
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
                {p.is_custom_price
                  ? `From £${p.min_price_gbp?.toLocaleString("en-GB")}`
                  : `£${p.price_gbp?.toLocaleString("en-GB")}`}
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                {p.is_custom_price
                  ? `Multiples of £${p.price_increment_gbp?.toLocaleString("en-GB")}`
                  : `${p.participant_count} participants`}
                {" · "}margin £{p.platform_margin_gbp.toLocaleString("en-GB")}
              </p>
              {p.description && (
                <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                  {p.description}
                </p>
              )}
              <div className="mt-4 flex items-center gap-2 border-t border-black/10 pt-3">
                <Link
                  href={`/dashboard/admin/packages/${p.id}`}
                  className="btn btn-ghost text-sm"
                >
                  Edit
                </Link>
                <form action={togglePackageActive}>
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
