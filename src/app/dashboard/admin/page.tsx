import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import type { Campaign, SponsoredEvent } from "@/lib/types";

export const metadata = { title: "Admin console" };

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
) {
  const { count: c } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  return c ?? 0;
}

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const [
    brands,
    artists,
    organisers,
    audiences,
    campaigns,
    listings,
    sponsored,
  ] = await Promise.all([
    count(supabase, "brands"),
    count(supabase, "artists"),
    count(supabase, "event_organisers"),
    count(supabase, "audience_members"),
    count(supabase, "campaigns"),
    count(supabase, "event_listings"),
    count(supabase, "sponsored_events"),
  ]);

  const { data: recentCampaigns } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  const { data: recentSponsored } = await supabase
    .from("sponsored_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  const stats = [
    { label: "Brands", value: brands },
    { label: "Artists", value: artists },
    { label: "Organisers", value: organisers },
    { label: "Audience", value: audiences },
    { label: "Campaigns", value: campaigns },
    { label: "Event listings", value: listings },
    { label: "Sponsored events", value: sponsored },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin console"
        subtitle="Platform overview across all accounts and activity."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-[var(--color-ink-soft)]">{s.label}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent sponsor requests</h2>
        <div className="card divide-y divide-black/5">
          {((recentCampaigns ?? []) as Campaign[]).map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-5 py-3 text-sm"
            >
              <span className="truncate">
                {c.reference} — {c.description.slice(0, 50)}
              </span>
              <StatusBadge status={c.status} />
            </div>
          ))}
          {(!recentCampaigns || recentCampaigns.length === 0) && (
            <p className="px-5 py-4 text-sm text-[var(--color-ink-soft)]">
              No campaigns yet.
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent sponsored events</h2>
        <div className="card divide-y divide-black/5">
          {((recentSponsored ?? []) as SponsoredEvent[]).map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between px-5 py-3 text-sm"
            >
              <span className="truncate">
                {e.reference} — {e.name}
              </span>
              <StatusBadge status={e.status} />
            </div>
          ))}
          {(!recentSponsored || recentSponsored.length === 0) && (
            <p className="px-5 py-4 text-sm text-[var(--color-ink-soft)]">
              No sponsored events yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
