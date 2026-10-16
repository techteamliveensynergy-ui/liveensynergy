import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import type { Participation, RewardCode, SponsoredEvent } from "@/lib/types";
import { selfReportRewardCodeRedeemed } from "../sponsored/actions";
import { platformLabel, PLATFORM_HOW_TO } from "@/lib/discount-codes";
import { UK_TIME_ZONE } from "@/lib/format";

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
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  const allRows = (data ?? []) as Row[];

  const { data: codeData } =
    allRows.length > 0
      ? await supabase
          .from("reward_codes")
          .select("*, sponsored_events(name)")
          .in(
            "participation_id",
            allRows.map((r) => r.id),
          )
          .order("issued_at", { ascending: false })
      : { data: [] };
  const codes = (codeData ?? []) as CodeRow[];

  // Rewards are discount codes (9 Oct standup), released as soon as a survey
  // passes (0075) — before the event as often as after, so every
  // registration's codes are listed. A checked-in event with no code yet is
  // still waiting on its survey (or the team issuing codes).
  const codedParticipations = new Set(codes.filter((c) => c.status !== "void").map((c) => c.participation_id));
  const rows = allRows.filter(
    (r) => codedParticipations.has(r.id) || r.status === "attendance_verified" || r.status === "reward_released",
  );
  const waiting = rows.filter((r) => !codedParticipations.has(r.id));

  return (
    <div>
      <PageHeader
        title="My rewards"
        subtitle="Your discount codes — released as soon as your event survey is complete."
      />

      {rows.length === 0 && (
        <EmptyState
          icon="🎁"
          title="No rewards yet"
          body="Register for an event and complete its survey to receive a discount code."
          cta={{ href: "/dashboard/discover", label: "Discover events" }}
        />
      )}

      {waiting.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Waiting for your code</h2>
          <div className="space-y-3">
            {waiting.map((r) => (
              <div key={r.id} className="card flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <h3 className="font-semibold">{r.sponsored_events?.name ?? "Event"}</h3>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    You&apos;re checked in. Complete the survey in My events — your code is issued once it&apos;s
                    checked.
                  </p>
                </div>
                <Link href="/dashboard/participations" className="btn btn-ghost text-sm">
                  Go to my events
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {codes.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">
            Discount &amp; merch codes
          </h2>
          <div className="space-y-3">
            {codes.map((c) => {
              // The code is redeemed on the brand's own platform — we can't
              // see that happen, so "expired" is derived from the date rather
              // than written back.
              const expired =
                c.status === "issued" && !!c.expires_at && new Date(c.expires_at) < new Date();
              const platform = platformLabel(c.redemption_platform);
              const howTo =
                c.redemption_instructions ??
                (c.redemption_platform ? PLATFORM_HOW_TO[c.redemption_platform] : undefined);
              return (
              <div
                key={c.id}
                className="card flex flex-wrap items-start justify-between gap-3 p-5"
                data-testid="reward-code"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      {c.sponsored_events?.name ?? "Event"}
                    </h3>
                    <StatusBadge status={expired ? "expired" : c.status} />
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                    {c.value_label ?? (c.code_type === "merch" ? "Merch" : "Discount")}
                    {platform ? ` · redeem on ${platform}` : ""}
                  </p>
                  <p className="mt-2 inline-block max-w-full break-all rounded-lg bg-[var(--color-mist)] px-3 py-1.5 font-mono text-lg tracking-wide">
                    {c.code}
                  </p>
                  {howTo && c.status === "issued" && !expired && (
                    <p className="mt-2 text-sm text-[var(--color-ink-soft)]">{howTo}</p>
                  )}
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                    {c.expires_at &&
                      `${expired ? "Expired" : "Use by"} ${new Date(c.expires_at).toLocaleDateString("en-GB", { timeZone: UK_TIME_ZONE })}`}
                    {c.redemption_url && c.status === "issued" && !expired && (
                      <>
                        {c.expires_at ? " · " : ""}
                        <a
                          href={c.redemption_url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          Go to {platform ?? "the ticket page"}
                        </a>
                      </>
                    )}
                  </p>
                </div>
                {c.status === "issued" && !expired && (
                  <form action={selfReportRewardCodeRedeemed}>
                    <input type="hidden" name="code_id" value={c.id} />
                    <button type="submit" className="btn btn-ghost text-sm">
                      Mark as redeemed
                    </button>
                  </form>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
