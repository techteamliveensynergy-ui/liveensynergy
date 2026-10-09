import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Artists · Admin" };

interface Person {
  profile_id: string;
  name: string;
  legacyOrganiser: boolean;
  category: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null; is_active: boolean; last_seen_at: string | null } | null;
}

/**
 * Artists and event partners (Admin Portal brief, 9 Oct — "Artists replaces
 * Events"). Organisers who signed up before the 3 Aug merge are still
 * `event_organisers` rows; they're listed here too, marked as such. The
 * full events / sponsorships view stays one click away.
 */
export default async function AdminArtistsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireRole(["admin"]);
  const { q } = await searchParams;
  const supabase = await createClient();

  const profileCols = "profiles(full_name, email, is_active, last_seen_at)";
  const [{ data: artistRows }, { data: organiserRows }, { data: listingRows }, { data: sponsorshipRows }] = await Promise.all([
    supabase.from("artists").select(`profile_id, artist_name, stage_name, category, created_at, ${profileCols}`),
    supabase.from("event_organisers").select(`profile_id, event_name, contact_name, created_at, ${profileCols}`),
    supabase.from("event_listings").select("owner_profile_id, status"),
    supabase.from("sponsored_events").select("artist_profile_id, status"),
  ]);

  type ProfileJoin = Person["profiles"];
  const people: Person[] = [
    ...((artistRows ?? []) as unknown as {
      profile_id: string; artist_name: string; stage_name: string | null; category: string | null; created_at: string; profiles: ProfileJoin;
    }[]).map((a) => ({
      profile_id: a.profile_id,
      name: a.stage_name || a.artist_name,
      legacyOrganiser: false,
      category: a.category,
      created_at: a.created_at,
      profiles: a.profiles,
    })),
    ...((organiserRows ?? []) as unknown as {
      profile_id: string; event_name: string | null; contact_name: string | null; created_at: string; profiles: ProfileJoin;
    }[]).map((o) => ({
      profile_id: o.profile_id,
      name: o.event_name || o.contact_name || "Event organiser",
      legacyOrganiser: true,
      category: null,
      created_at: o.created_at,
      profiles: o.profiles,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const term = (q ?? "").trim().toLowerCase();
  const shown = people.filter(
    (p) => !term || p.name.toLowerCase().includes(term) || (p.profiles?.email ?? "").toLowerCase().includes(term),
  );
  const listings = (listingRows ?? []) as { owner_profile_id: string; status: string }[];
  const deals = (sponsorshipRows ?? []) as { artist_profile_id: string; status: string }[];

  return (
    <div>
      <PageHeader
        title="Artists"
        subtitle={`${people.length} artists and event partners — their listings and sponsorships.`}
        action={
          <Link href="/dashboard/admin/events" className="btn btn-ghost text-sm">
            All events & sponsorships →
          </Link>
        }
      />

      <form className="mb-5 flex gap-2" action="/dashboard/admin/artists">
        <input name="q" defaultValue={q ?? ""} placeholder="Search name or email" className="input max-w-sm" />
        <button type="submit" className="btn btn-ghost text-sm">Search</button>
      </form>

      {shown.length === 0 ? (
        <EmptyState icon="🎤" title="No artists found" body={term ? "Nothing matches that search." : "No artist has signed up yet."} />
      ) : (
        <div className="space-y-3">
          {shown.map((p) => {
            const mine = listings.filter((l) => l.owner_profile_id === p.profile_id);
            const available = mine.filter((l) => l.status === "available").length;
            const myDeals = deals.filter((d) => d.artist_profile_id === p.profile_id);
            const live = myDeals.filter((d) => d.status === "confirmed").length;
            return (
              <div key={p.profile_id} className="card flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {p.name}
                    {p.legacyOrganiser && (
                      <span className="ml-2 chip bg-[var(--color-mist)] text-[var(--color-ink-soft)]">Organiser (pre-merge)</span>
                    )}
                    {p.profiles && !p.profiles.is_active && (
                      <span className="ml-2 chip bg-[var(--color-pink)] text-[var(--color-accent)]">Blocked</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
                    {p.profiles?.full_name ?? "—"}
                    {p.profiles?.email ? ` · ${p.profiles.email}` : ""}
                    {p.category ? ` · ${p.category}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    Joined {formatDate(p.created_at)}
                    {p.profiles?.last_seen_at ? ` · last seen ${formatDate(p.profiles.last_seen_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span>
                    <span className="font-semibold">{mine.length}</span> listing{mine.length === 1 ? "" : "s"} ({available} open)
                  </span>
                  <span>
                    <span className="font-semibold">{myDeals.length}</span> sponsorship{myDeals.length === 1 ? "" : "s"} · {live} live
                  </span>
                  <Link href={`/dashboard/admin/users/${p.profile_id}`} className="btn btn-ghost text-sm">
                    Account
                  </Link>
                  <Link
                    href={`/dashboard/messages/with/${p.profile_id}?subject=${encodeURIComponent(p.name)}`}
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
