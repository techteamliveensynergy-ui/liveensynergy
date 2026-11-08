import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MetricTile, StatusBadge } from "@/components/dashboard/ui";
import { participationBadge, participationSteps } from "@/components/dashboard/ParticipationProgress";
import { loadAudienceProgress } from "@/lib/data/audience-progress";
import type { AudienceMember, Participation, Profile, SponsoredEvent } from "@/lib/types";
import { formatEventDateTime } from "@/lib/event-time";
import { UK_TIME_ZONE } from "@/lib/format";

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

  // Same survey/code picture as My events (survey-link responses included),
  // so the two pages never disagree about where someone is.
  const { surveyDone, codeWaitFor, codeByParticipation } = await loadAudienceProgress(supabase, profile.id, rows);
  const withCode = { has: (id: string) => codeByParticipation.has(id) };

  // The Overview is "what do I do next?" — one line per event, the events that
  // need the member first. The full step trackers live on My events (QA 8 Nov:
  // the two pages showed the same thing).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isPast = (r: Row) =>
    Boolean(r.sponsored_events?.event_date) && new Date(`${r.sponsored_events!.event_date}T23:59:59`) < startOfToday;
  const NEEDS_YOU = new Set(["Ticket uploaded", "Attended", "Survey"]);
  const nextSteps = rows
    .filter((r) => r.status !== "rejected")
    .map((r) => {
      const hasCode = codeByParticipation.has(r.id);
      const steps = participationSteps(r, {
        surveyDone: surveyDone(r),
        hasCode,
        codeWait: hasCode ? null : codeWaitFor(r),
      });
      const current = steps.find((st) => st.state === "current");
      // Ticket upload only once selected; before that the team is choosing.
      const needsYou = Boolean(current && NEEDS_YOU.has(current.label) && (r.selected || current.label === "Survey"));
      return { r, current, needsYou, hasCode, done: !current };
    })
    .sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || Number(a.done) - Number(b.done))
    .slice(0, 5);
  const needsYouCount = nextSteps.filter((n) => n.needsYou).length;

  const verifiedCount = rows.filter((r) =>
    ["attendance_verified", "reward_released"].includes(r.status),
  ).length;
  const pendingCount = rows.filter((r) =>
    ["registered", "ticket_uploaded"].includes(r.status),
  ).length;
  const selectedCount = rows.filter((r) => r.selected).length;
  // Rewards are discount codes (9 Oct standup); a participation reaches
  // reward_released when its code is issued.
  // A code released by the survey (0075) leaves the row at
  // attendance_verified, so the code itself counts too.
  const codesReceived = rows.filter((r) => r.status === "reward_released" || withCode.has(r.id)).length;

  const memberSince = member?.created_at
    ? new Date(member.created_at).toLocaleDateString("en-GB", {
        timeZone: UK_TIME_ZONE,
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
            ? "Discover partnered events — attend, share your views in a short survey and get a discount code."
            : pendingCount > 0
              ? `You have ${pendingCount} event${pendingCount === 1 ? "" : "s"} in progress — keep an eye on the next step.`
              : "You're all caught up — go find your next event."}
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <MetricTile
          label="Events registered (participated)"
          value={rows.length}
          tint="bg-[var(--color-sage)]"
        />
        <MetricTile label="Selected in the draw" value={selectedCount} tint="bg-[var(--color-mint)]" />
        <MetricTile
          label="Verified attendance at events"
          value={verifiedCount}
          tint="bg-[var(--color-lavender)]"
        />
        <MetricTile label="In progress" value={pendingCount} tint="bg-[var(--color-pink)]" />
        <MetricTile label="Discount codes received" value={codesReceived} tint="bg-[var(--color-gold)]" />
      </div>

      {/* Account card alongside the shortcuts; the reward tracker gets the
          full width of the page to itself, at the foot. */}
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_2fr]">
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
                {codesReceived}
              </p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Codes received</p>
            </div>
          </div>
          <Link href="/dashboard/profile" className="btn btn-ghost mt-4 w-full">
            Edit account details
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/discover" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">Find events</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Browse partnered events near you.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link href="/dashboard/participations" className="card block p-5 transition hover:-translate-y-0.5">
          <h3 className="font-semibold text-[var(--color-ink)]">My participated events</h3>
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
            Your discount codes and how to use them.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        </div>
      </div>

      {/* What's next — one line per event, the ones waiting on the member
          first. The full step-by-step trackers are on My events. */}
      <div className="card mt-5 p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">What&apos;s next</h2>
            {rows.length > 0 && (
              <p className="text-sm text-[var(--color-ink-soft)]">
                {needsYouCount > 0
                  ? `${needsYouCount} event${needsYouCount === 1 ? " needs" : "s need"} something from you.`
                  : "Nothing needs you right now — we'll email you when it does."}
              </p>
            )}
          </div>
          <Link href="/dashboard/participations" className="text-sm font-semibold text-[var(--color-brand-dark)]">
            All my events →
          </Link>
        </div>
        {rows.length === 0 ? (
          <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
            No events yet.{" "}
            <Link href="/dashboard/discover" className="font-semibold text-[var(--color-brand-dark)]">
              Discover events →
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-black/5">
            {nextSteps.map(({ r, current, needsYou, hasCode }) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[var(--color-ink)]">{r.sponsored_events?.name ?? "Event"}</p>
                    <StatusBadge status={participationBadge(r, hasCode)} />
                  </div>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {r.sponsored_events?.event_date
                      ? formatEventDateTime({
                          date: r.sponsored_events.event_date,
                          time: r.sponsored_events.start_time,
                          timeZone: r.sponsored_events.timezone,
                        })
                      : "Date TBC"}
                  </p>
                  <p className={`mt-1 text-sm ${needsYou ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]"}`}>
                    {current
                      ? `${needsYou ? "Your next step" : "Next"}: ${current.hint ?? current.label}`
                      : "All done — your discount code is under My rewards."}
                  </p>
                </div>
                <Link
                  href={
                    current
                      ? `/dashboard/participations${isPast(r) ? "?tab=past" : ""}#event-${r.id}`
                      : "/dashboard/rewards"
                  }
                  className={`btn shrink-0 text-sm ${needsYou ? "btn-primary" : "btn-ghost"}`}
                >
                  {current ? (needsYou ? "Do this now" : "View") : "My rewards"}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {rows.length > nextSteps.length && (
          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            Showing {nextSteps.length} of {rows.length} — see the rest under My events.
          </p>
        )}
      </div>
    </div>
  );
}
