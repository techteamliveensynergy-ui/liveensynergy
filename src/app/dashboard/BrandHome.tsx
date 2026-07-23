import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MetricTile, StatusBadge } from "@/components/dashboard/ui";
import { computePlatformFee } from "@/lib/constants";
import type { Campaign, EventListing, Profile, SponsoredEvent } from "@/lib/types";

export async function BrandHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, brand_name, product_category")
    .eq("profile_id", profile.id)
    .maybeSingle();

  let campaigns: Campaign[] = [];
  let sponsored: SponsoredEvent[] = [];
  let suggested: EventListing[] = [];
  let verifiedCount = 0;

  if (brand) {
    const [{ data: campaignData }, { data: sponsoredData }, { data: listingData }] =
      await Promise.all([
        supabase
          .from("campaigns")
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("sponsored_events")
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("event_listings")
          .select("*")
          .eq("status", "available")
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

    campaigns = (campaignData ?? []) as Campaign[];
    sponsored = (sponsoredData ?? []) as SponsoredEvent[];
    suggested = (listingData ?? []) as EventListing[];

    const sponsoredIds = sponsored.map((s) => s.id);
    if (sponsoredIds.length > 0) {
      const { count } = await supabase
        .from("participations")
        .select("id", { count: "exact", head: true })
        .in("sponsored_event_id", sponsoredIds)
        .in("status", ["attendance_verified", "reward_released"]);
      verifiedCount = count ?? 0;
    }
  }

  const activeCampaigns = campaigns.filter((c) => c.status === "in_progress").length;
  const confirmed = sponsored.filter((s) => s.status === "confirmed").length;
  const budgetRemaining = sponsored.reduce(
    (sum, s) => sum + Number(s.remaining_budget_gbp ?? 0),
    0,
  );

  return (
    <div>
      <div className="mb-8">
        <p className="font-serif text-[var(--color-ink-soft)]">
          {brand?.brand_name ?? "Brand"} workspace
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
          Welcome back, {profile.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          {!brand
            ? "Finish your brand profile to start creating sponsorship campaigns."
            : campaigns.length === 0
              ? "Create your first sponsorship campaign to get matched with an artist or event."
              : `You have ${activeCampaigns} campaign${activeCampaigns === 1 ? "" : "s"} in progress.`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Active campaigns"
          value={activeCampaigns}
          tint="bg-[#faf5ee]"
        />
        <MetricTile
          label="Confirmed sponsorships"
          value={confirmed}
          tint="bg-[var(--color-lavender)]"
        />
        <MetricTile
          label="Verified attendees"
          value={verifiedCount}
          tint="bg-[var(--color-sage)]"
        />
        <MetricTile
          label="Budget remaining"
          value={`£${budgetRemaining.toLocaleString("en-GB")}`}
          tint="bg-[#fbeadd]"
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
                Campaigns in flight
              </h2>
              <p className="text-xs text-[var(--color-ink-soft)]">
                All budgets shown net of platform fee.
              </p>
            </div>
            <Link
              href="/dashboard/campaigns"
              className="text-sm font-semibold text-[var(--color-brand-dark)]"
            >
              See all →
            </Link>
          </div>
          {campaigns.length === 0 ? (
            <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
              No campaigns yet.{" "}
              <Link
                href="/dashboard/campaigns/new"
                className="font-semibold text-[var(--color-brand-dark)]"
              >
                Create one →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.slice(0, 4).map((c) => {
                const fee = computePlatformFee(Number(c.budget_gbp));
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/campaigns/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 transition hover:bg-white hover:shadow-sm"
                  >
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">
                        {c.target_name || c.category || "Sponsorship campaign"}
                      </p>
                      <p className="text-xs text-[var(--color-ink-soft)]">
                        Ref {c.reference}
                      </p>
                    </div>
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      £{fee.availableForSponsorship.toLocaleString("en-GB", { maximumFractionDigits: 0 })} net
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                      Manage →
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card bg-[var(--color-lavender)] p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Suggested for you
            </h2>
            <Link href="/dashboard/discover" className="text-sm font-semibold text-[var(--color-purple-deep)]">
              Browse →
            </Link>
          </div>
          {suggested.length === 0 ? (
            <p className="text-sm text-[var(--color-ink)]/70">
              No open events yet — check back soon.
            </p>
          ) : (
            <div className="space-y-2">
              {suggested.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between rounded-2xl bg-white p-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                      {l.name}
                    </p>
                    <p className="truncate text-xs text-[var(--color-ink-soft)]">
                      {[l.category, l.city, l.budget_range].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/campaigns/new"
          className="card block p-5 transition hover:-translate-y-0.5"
        >
          <h3 className="font-semibold text-[var(--color-ink)]">Create a campaign</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Set a budget and reward rules — we&apos;ll find a fitting match.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link
          href="/dashboard/discover"
          className="card block p-5 transition hover:-translate-y-0.5"
        >
          <h3 className="font-semibold text-[var(--color-ink)]">Discover events</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Browse events currently open for sponsorship.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link
          href="/dashboard/profile"
          className="card block p-5 transition hover:-translate-y-0.5"
        >
          <h3 className="font-semibold text-[var(--color-ink)]">
            {brand ? "Update your brand profile" : "Complete your brand profile"}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Add your mission, keywords and manager details.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
      </div>
    </div>
  );
}
