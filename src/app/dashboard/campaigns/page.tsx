import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { Campaign } from "@/lib/types";
import { deleteCampaign } from "./actions";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const { data } = brand
    ? await supabase
        .from("campaigns")
        .select("*")
        .eq("brand_id", brand.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const campaigns = (data ?? []) as Campaign[];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Create sponsorship proposals — we'll match you with a fitting artist or event."
        action={
          <Link href="/dashboard/campaigns/new" className="btn btn-primary">
            + New campaign
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon="📣"
          title="No campaigns yet"
          body="Set a budget and reward rules, and our team will find a suitable match."
          cta={{ href: "/dashboard/campaigns/new", label: "Create a campaign" }}
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="card flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">
                    {c.target_name || c.category || "Sponsorship campaign"}
                  </h3>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
                  {c.description}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                  Ref {c.reference} · Budget £
                  {Number(c.budget_gbp).toLocaleString("en-GB")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/campaigns/${c.id}`}
                  className="btn btn-ghost text-sm"
                >
                  Edit
                </Link>
                <form action={deleteCampaign}>
                  <input type="hidden" name="id" value={c.id} />
                  <button
                    type="submit"
                    className="btn btn-ghost text-sm text-red-600"
                  >
                    Delete
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
