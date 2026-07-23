import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MetricTile, StatusBadge } from "@/components/dashboard/ui";
import type { AudienceMember, Participation, Profile, SponsoredEvent } from "@/lib/types";

type Row = Participation & { sponsored_events: SponsoredEvent | null };

export async function AudienceHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();

  const [{ data: memberData }, { data: rowData }] = await Promise.all([
    supabase
      .from("audience_members")
      .select("*")
      .eq("profile_id", profile.id)
      .maybeSingle(),
    supabase
      .from("participations")
      .select("*, sponsored_events(*)")
      .eq("audience_profile_id", profile.id)
      .order("created_at", { ascending: false }),
  ]);

  const member = memberData as AudienceMember | null;
  const rows = (rowData ?? []) as Row[];

  const verifiedCount = rows.filter((r) =>
    ["attendance_verified", "reward_released"].includes(r.status),
  ).length;
  const pendingCount = rows.filter((r) =>
    ["registered", "ticket_uploaded"].includes(r.status),
  ).length;
  const totalRewarded = rows
    .filter((r) => r.status === "reward_released")
    .reduce((sum, r) => sum + Number(r.reward_amount_gbp ?? 0), 0);

  const memberSince = member?.created_at
    ? new Date(member.created_at).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div>
      <div className="mb-8">
        <p className="font-serif text-[var(--color-ink-soft)]">Your audience pass</p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
          Welcome back, {profile.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          {rows.length === 0
            ? "Discover events with sponsor-funded rewards and register to attend."
            : pendingCount > 0
              ? `You have ${pendingCount} event${pendingCount === 1 ? "" : "s"} in progress — keep an eye on the next step.`
              : "You're all caught up — go find your next event."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Events registered" value={rows.length} tint="bg-[var(--color-sage)]" />
        <MetricTile label="Verified attendances" value={verifiedCount} tint="bg-[var(--color-lavender)]" />
        <MetricTile
          label="Rewarded to date"
          value={`£${totalRewarded.toLocaleString("en-GB")}`}
          tint="bg-[var(--color-gold)]"
        />
        <MetricTile label="In progress" value={pendingCount} tint="bg-[var(--color-pink)]" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Reward tracker
            </h2>
            <Link
              href="/dashboard/participations"
              className="text-sm font-semibold text-[var(--color-brand-dark)]"
            >
              See all →
            </Link>
          </div>
          {rows.length === 0 ? (
            <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
              No events yet.{" "}
              <Link
                href="/dashboard/discover"
                className="font-semibold text-[var(--color-brand-dark)]"
              >
                Discover events →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.slice(0, 4).map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4"
                >
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">
                      {r.sponsored_events?.name ?? "Event"}
                    </p>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      {r.sponsored_events?.event_date
                        ? new Date(r.sponsored_events.event_date).toLocaleDateString("en-GB")
                        : "Date TBC"}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                  <span className="text-sm text-[var(--color-ink-soft)]">
                    {r.reward_amount_gbp != null
                      ? `£${Number(r.reward_amount_gbp).toLocaleString("en-GB")}`
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card bg-[var(--color-mist)] p-6">
          <div className="flex items-center gap-3.5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[var(--color-olive)] font-serif text-2xl italic text-white">
              {(profile.full_name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-display font-semibold text-[var(--color-ink)]">
                {profile.full_name ?? "Your profile"}
              </p>
              {memberSince && (
                <p className="text-xs text-[var(--color-ink-soft)]">Member since {memberSince}</p>
              )}
              {member?.verified && (
                <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-sage)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-olive-deep)]">
                  ● Verified
                </span>
              )}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-black/10 bg-white p-3.5 text-center">
              <p className="font-display text-xl font-semibold text-[var(--color-ink)]">
                {verifiedCount}
              </p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Events attended</p>
            </div>
            <div className="rounded-xl border border-black/10 bg-white p-3.5 text-center">
              <p className="font-display text-xl font-semibold text-[var(--color-brand-dark)]">
                £{totalRewarded.toLocaleString("en-GB")}
              </p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Rewarded to date</p>
            </div>
          </div>
          <Link href="/dashboard/profile" className="btn btn-ghost mt-4 w-full">
            Edit account details
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/discover" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">Find events</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Browse events with sponsor-funded rewards.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link href="/dashboard/participations" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">My events</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Track the events you&apos;ve signed up for.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link href="/dashboard/rewards" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">My rewards</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Upload proof and claim your reimbursements.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
      </div>
    </div>
  );
}
