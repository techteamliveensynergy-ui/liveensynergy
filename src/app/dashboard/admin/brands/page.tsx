import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Brands · Admin" };

interface BrandRow {
  id: string;
  brand_name: string;
  profile_id: string;
  product_category: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null; is_active: boolean; last_seen_at: string | null } | null;
}

/**
 * Brands at a glance (Admin Portal brief, 9 Oct — new "Brands" module):
 * each brand with its requests, campaigns and live campaigns, and a way to
 * message them. User-level detail stays on the Users page.
 */
export default async function AdminBrandsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole(["admin"]);
  const { q } = await searchParams;
  const supabase = await createClient();

  const [{ data: brandRows }, { data: campaignRows }, { data: intakeRows }, { data: liveRows }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, brand_name, profile_id, product_category, created_at, profiles(full_name, email, is_active, last_seen_at)")
      .order("brand_name"),
    supabase.from("campaigns").select("brand_id, status"),
    supabase.from("campaign_intake_requests").select("brand_id, status"),
    supabase.from("sponsored_events").select("brand_id").in("status", ["confirmed", "completed"]),
  ]);

  const term = (q ?? "").trim().toLowerCase();
  const brands = ((brandRows ?? []) as unknown as BrandRow[]).filter(
    (b) =>
      !term ||
      b.brand_name.toLowerCase().includes(term) ||
      (b.profiles?.email ?? "").toLowerCase().includes(term) ||
      (b.profiles?.full_name ?? "").toLowerCase().includes(term),
  );
  const count = <T extends { brand_id: string }>(rows: T[] | null, id: string, pred: (r: T) => boolean = () => true) =>
    (rows ?? []).filter((r) => r.brand_id === id && pred(r)).length;

  return (
    <div>
      <PageHeader title="Brands" subtitle={`${(brandRows ?? []).length} brand accounts — requests, campaigns and what's live.`} />

      <form className="mb-5 flex gap-2" action="/dashboard/admin/brands">
        <input name="q" defaultValue={q ?? ""} placeholder="Search brand, contact or email" className="input max-w-sm" />
        <button type="submit" className="btn btn-ghost text-sm">Search</button>
      </form>

      {brands.length === 0 ? (
        <EmptyState icon="🏷️" title="No brands found" body={term ? "Nothing matches that search." : "No brand has signed up yet."} />
      ) : (
        <div className="space-y-3">
          {brands.map((b) => {
            const openRequests = count(intakeRows as { brand_id: string; status: string }[], b.id, (r) => r.status === "submitted" || r.status === "in_review");
            const campaigns = count(campaignRows as { brand_id: string; status: string }[], b.id);
            const live = count(liveRows as { brand_id: string }[], b.id);
            return (
              <div key={b.id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {b.brand_name}
                    {b.profiles && !b.profiles.is_active && (
                      <span className="ml-2 chip bg-[var(--color-pink)] text-[var(--color-accent)]">Blocked</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                    {b.profiles?.full_name ?? "—"}
                    {b.profiles?.email ? ` · ${b.profiles.email}` : ""}
                    {b.product_category ? ` · ${b.product_category}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    Joined {formatDate(b.created_at)}
                    {b.profiles?.last_seen_at ? ` · last seen ${formatDate(b.profiles.last_seen_at)}` : " · never signed in since"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span title="Requests waiting for review">
                    <span className="font-semibold">{openRequests}</span> open request{openRequests === 1 ? "" : "s"}
                  </span>
                  <span>
                    <span className="font-semibold">{campaigns}</span> campaign{campaigns === 1 ? "" : "s"}
                  </span>
                  <span>
                    <span className="font-semibold">{live}</span> live
                  </span>
                  <Link href={`/dashboard/admin/users/${b.profile_id}`} className="btn btn-ghost text-sm">
                    Account
                  </Link>
                  <Link
                    href={`/dashboard/messages/with/${b.profile_id}?subject=${encodeURIComponent(b.brand_name)}`}
                    className="btn btn-ghost text-sm"
                  >
                    Message
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
