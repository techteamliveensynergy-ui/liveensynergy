import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { Participation, RewardCode, SponsoredEvent } from "@/lib/types";
import { selfReportRewardCodeRedeemed } from "../sponsored/actions";

export const metadata = { title: "My rewards" };

type Row = Participation & { sponsored_events: SponsoredEvent | null };
type CodeRow = RewardCode & { sponsored_events: { name: string } | null };

export default async function RewardsPage() {
  const { profile } = await requireRole(["audience"]);
  const supabase = await createClient();

  const { data } = await supabase
    .from("participations")
    .select("*, sponsored_events(*)")
    .eq("audience_profile_id", profile.id)
    .in("status", ["attendance_verified", "reward_released"])
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  const { data: codeData } =
    rows.length > 0
      ? await supabase
          .from("reward_codes")
          .select("*, sponsored_events(name)")
          .in(
            "participation_id",
            rows.map((r) => r.id),
          )
          .order("issued_at", { ascending: false })
      : { data: [] };
  const codes = (codeData ?? []) as CodeRow[];

  const released = rows.filter((r) => r.status === "reward_released");
  const total = released.reduce(
    (sum, r) => sum + Number(r.reward_amount_gbp ?? 0),
    0,
  );

  return (
    <div>
      <PageHeader
        title="My rewards"
        subtitle="Rewards from events where your attendance was verified."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="🎁"
          title="No rewards yet"
          body="Register for events, attend and get verified to unlock sponsor-funded rewards."
          cta={{ href: "/dashboard/discover", label: "Discover events" }}
        />
      ) : (
        <>
          <div className="card mb-6 flex items-center justify-between p-6">
            <div>
              <p className="text-sm text-[var(--color-ink-soft)]">
                Total rewards released
              </p>
              <p className="text-2xl font-bold">
                £{total.toLocaleString("en-GB")}
              </p>
            </div>
            <Link href="/dashboard/participations" className="btn btn-ghost">
              View all events
            </Link>
          </div>
          <div className="space-y-3">
            {rows.map((r) => (
              <div
                key={r.id}
                className="card flex items-center justify-between p-5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      {r.sponsored_events?.name ?? "Event"}
                    </h3>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    {r.reward_released_at
                      ? `Released ${new Date(r.reward_released_at).toLocaleDateString("en-GB")}`
                      : "Pending release"}
                  </p>
                </div>
                <p className="text-lg font-semibold">
                  {r.reward_amount_gbp != null
                    ? `£${Number(r.reward_amount_gbp).toLocaleString("en-GB")}`
                    : "—"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {codes.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">
            Discount &amp; merch codes
          </h2>
          <div className="space-y-3">
            {codes.map((c) => (
              <div
                key={c.id}
                className="card flex flex-wrap items-center justify-between gap-3 p-5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      {c.sponsored_events?.name ?? "Event"}
                    </h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    {c.value_label ?? (c.code_type === "merch" ? "Merch" : "Discount")}
                    {" · "}
                    <span className="font-mono">{c.code}</span>
                  </p>
                </div>
                {c.status === "issued" && (
                  <form action={selfReportRewardCodeRedeemed}>
                    <input type="hidden" name="code_id" value={c.id} />
                    <button type="submit" className="btn btn-ghost text-sm">
                      Mark as redeemed
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
