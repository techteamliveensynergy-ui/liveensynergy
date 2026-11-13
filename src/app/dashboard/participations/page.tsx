import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import {
  ParticipationProgress,
  isImagePath,
  participationBadge,
  participationSteps, type CodeWait } from "@/components/dashboard/ParticipationProgress";
import { signedUrlFor } from "@/lib/storage";
import type { Participation, SponsoredEvent } from "@/lib/types";
import { platformLabel } from "@/lib/discount-codes";
import { loadAudienceProgress } from "@/lib/data/audience-progress";
import { eventCapacity, isCancelledEvent, waitlistedMessage } from "@/lib/event-safety";
import { leaveWaitlist } from "../discover/actions";
import { SURVEY_HELD_FOR_REVIEW_MESSAGE, SURVEY_RECEIVED_MESSAGE, SURVEY_UNDER_REVIEW_MESSAGE } from "@/lib/survey-capacity";
import { formatEventDateTime } from "@/lib/event-time";
import { formatDateTime, UK_TIME_ZONE } from "@/lib/format";
import {
  provideConsent,
  withdrawParticipation,
} from "./actions";

export const metadata = { title: "My events" };

type Row = Participation & { sponsored_events: SponsoredEvent | null };

export default async function ParticipationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; tab?: string }>;
}) {
  const { profile } = await requireRole(["audience"]);
  const { notice, tab: rawTab } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("participations")
    .select("*, sponsored_events(*)")
    .eq("audience_profile_id", profile.id)
    .order("created_at", { ascending: false });
  const allRows = (data ?? []) as Row[];

  // One opt-in for every partner brand (0119). Once on, the tick is hidden here
  // and turned off in the profile. A database without 0119 reads as "off".
  const { data: marketingRow } = await supabase
    .from("audience_members")
    .select("partner_marketing_all")
    .eq("profile_id", profile.id)
    .maybeSingle<{ partner_marketing_all: boolean }>();
  const partnerMarketingAll = marketingRow?.partner_marketing_all === true;

  // "Past" is keyed on the event date, not the participation status — a reward
  // can still be outstanding on an event that has already happened, and that's
  // exactly what someone checking their history is looking for.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const isPast = (r: Row) => {
    const date = r.sponsored_events?.event_date;
    if (!date) return false; // undated events stay under Upcoming
    return new Date(`${date}T23:59:59`) < startOfToday;
  };

  const upcoming = allRows.filter((r) => !isPast(r));
  const past = allRows.filter(isPast);
  const tab: "upcoming" | "past" = rawTab === "past" ? "past" : "upcoming";
  const rows = tab === "past" ? past : upcoming;

  // Surveys, responses and codes for these events — shared with the Overview
  // (src/lib/data/audience-progress.ts) so both say the same thing.
  const { surveyTemplates, respondedKeys, respondedPublicly, surveyDone, codeWaitFor, codeByParticipation } =
    await loadAudienceProgress(supabase, profile.id, allRows);

  // Waitlist places (0114) — with the event and the person's place in the queue.
  const { data: waitRows } = await supabase
    .from("event_waitlist")
    .select("id, sponsored_event_id, created_at, sponsored_events(name, event_date, start_time, timezone)")
    .eq("profile_id", profile.id)
    .is("promoted_at", null)
    .is("left_at", null)
    .is("cancelled_at", null)
    .order("created_at");
  const waiting = await Promise.all(
    ((waitRows ?? []) as unknown as {
      id: string;
      sponsored_event_id: string;
      created_at: string;
      sponsored_events: Pick<SponsoredEvent, "name" | "event_date" | "start_time" | "timezone"> | null;
    }[]).map(async (w) => ({ ...w, position: (await eventCapacity(supabase, w.sponsored_event_id))?.my_position ?? null })),
  );

  // Ticket proofs sit in the private bucket — each thumbnail needs its own
  // short-lived signed URL, generated per render.
  const ticketLinks = new Map(
    await Promise.all(
      rows.map(async (r): Promise<[string, string | null]> => [
        r.id,
        r.ticket_proof_url
          ? ((await signedUrlFor(r.ticket_proof_url)) ??
            // Older rows stored a pasted external link rather than a path.
            (/^https?:\/\//.test(r.ticket_proof_url)
              ? r.ticket_proof_url
              : null))
          : null,
      ]),
    ),
  );

  return (
    <div>
      <PageHeader
        title="My events"
        subtitle="Track the events you've registered for and complete each step to claim your reward."
        action={
          <Link href="/dashboard/discover" className="btn btn-primary">
            Find events
          </Link>
        }
      />

      {/* Registering used to drop you here with no acknowledgement at all,
          which read as the button having done nothing. */}
      {notice === "registered" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          ✓ You&apos;re registered. Next: answer the event&apos;s short survey below — your
          discount code follows once your response passes our check.
        </p>
      )}
      {notice === "waitlisted" && (
        <p className="mb-5 rounded-lg bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
          {waitlistedMessage(waiting[waiting.length - 1]?.position)}
        </p>
      )}
      {notice === "left-waitlist" && (
        <p className="mb-5 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          You&apos;ve left the waitlist.
        </p>
      )}
      {notice === "already-registered" && (
        <p className="mb-5 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          You were already registered for that event — it&apos;s listed below.
        </p>
      )}
      {notice === "upload-success" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          ✓ Ticket uploaded. Your attendance will be verified at the venue.
        </p>
      )}
      {notice === "upload-failed" && (
        <p className="mb-5 rounded-lg bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          That file couldn&apos;t be uploaded — check it&apos;s under 25 MB and try again.
        </p>
      )}
      {notice === "upload-wrong-type" && (
        <p className="mb-5 rounded-lg bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          Please upload your ticket as a photo or a PDF.
        </p>
      )}
      {notice === "upload-not-allowed" && (
        <p className="mb-5 rounded-lg bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          Ticket proof can be added once you&apos;ve been selected, and before you check in at the event.
        </p>
      )}
      {notice === "survey-submitted" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          ✓ {SURVEY_RECEIVED_MESSAGE}
        </p>
      )}
      {notice === "survey-review" && (
        <p className="mb-5 rounded-lg bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
          {SURVEY_UNDER_REVIEW_MESSAGE}
        </p>
      )}
      {notice === "survey-held" && (
        <p className="mb-5 rounded-lg bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
          {SURVEY_HELD_FOR_REVIEW_MESSAGE}
        </p>
      )}
      {notice === "survey-closed" && (
        <p className="mb-5 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          That survey has now closed — it has received all the responses it needs. Thank you for your interest.
        </p>
      )}
      {notice === "survey-already-submitted" && (
        <p className="mb-5 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          You&apos;d already completed that survey.
        </p>
      )}

      {waiting.length > 0 && (
        <div id="waitlist" className="card mb-5 scroll-mt-6 p-5">
          <h2 className="font-semibold">On the waitlist</h2>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            These events are full. If a place opens up it&apos;s yours automatically — we&apos;ll email you, and any
            discount code you&apos;ve earned follows.
          </p>
          <ul className="mt-3 divide-y divide-black/5">
            {waiting.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p className="font-medium">{w.sponsored_events?.name ?? "Event"}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {w.position ? `Number ${w.position} in the queue` : "Waiting"}
                    {w.sponsored_events?.event_date
                      ? ` · ${formatEventDateTime({ date: w.sponsored_events.event_date, time: w.sponsored_events.start_time, timeZone: w.sponsored_events.timezone })}`
                      : ""}
                  </p>
                </div>
                <form action={leaveWaitlist}>
                  <input type="hidden" name="sponsored_event_id" value={w.sponsored_event_id} />
                  <button type="submit" className="btn btn-ghost text-sm">Leave waitlist</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Event Passport (Testing notes 7 Nov): every event they've checked in
          at, newest first. Check-in = scanning the venue QR (or the artist
          confirming them), recorded as attendance_verified_at. */}
      {(() => {
        const stamps = allRows
          .filter((r) => r.attendance_verified_at || ["attendance_verified", "reward_released"].includes(r.status))
          .sort((a, b) => String(b.attendance_verified_at ?? "").localeCompare(String(a.attendance_verified_at ?? "")));
        return (
          <div className="card mb-5 p-5" id="event-passport" data-testid="event-passport">
            <h2 className="font-semibold">🎫 Your Event Passport</h2>
            {stamps.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                Check in at an event — scan the QR code at the venue on the day — and it appears here.
              </p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {stamps.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-full border border-black/10 bg-[var(--color-mist)] px-3 py-1 text-sm"
                    title={r.attendance_verified_at ? `Checked in ${formatDateTime(r.attendance_verified_at)}` : "Checked in"}
                  >
                    <span className="font-medium">{r.sponsored_events?.name ?? "Event"}</span>
                    {r.sponsored_events?.event_date && (
                      <span className="text-[var(--color-ink-soft)]">
                        {" · "}
                        {formatEventDateTime({
                          date: r.sponsored_events.event_date,
                          time: null,
                          timeZone: r.sponsored_events.timezone,
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      <div className="mb-5 flex flex-wrap gap-2">
        <TabLink
          href="/dashboard/participations"
          label="Upcoming"
          count={upcoming.length}
          active={tab === "upcoming"}
        />
        <TabLink
          href="/dashboard/participations?tab=past"
          label="Past events"
          count={past.length}
          active={tab === "past"}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="🎟️"
          title={
            tab === "past"
              ? "No past events yet"
              : "You haven't registered for any upcoming events"
          }
          body={
            tab === "past"
              ? "Events you've attended will move here once the date has passed."
              : "Discover events with partner-funded rewards and register to attend."
          }
          cta={
            tab === "past"
              ? undefined
              : { href: "/dashboard/discover", label: "Discover events" }
          }
        />
      ) : (
        <div className="space-y-4">
          {rows.map((p) => {
            const ev = p.sponsored_events;
            return (
              // Anchor for the Overview's "What's next" links.
              <div key={p.id} id={`event-${p.id}`} className="card scroll-mt-6 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{ev?.name ?? "Event"}</h3>
                      {isCancelledEvent(ev) ? (
                        <span className="chip bg-[var(--color-pink)] text-[var(--color-accent)]">Cancelled</span>
                      ) : (
                        <StatusBadge status={participationBadge(p, codeByParticipation.has(p.id))} />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {[
                        ev?.event_date &&
                          formatEventDateTime({ date: ev.event_date, time: ev.start_time, timeZone: ev.timezone }),
                        ev?.venue_details,
                        ev?.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {/* Withdrawing is off the table once you're selected — the
                      reward is already earmarked and the organiser is counting
                      on the headcount (10 Aug standup). */}
                  {p.selected ? (
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      You&apos;re selected — contact the team if you can no
                      longer attend.
                    </p>
                  ) : (
                    <form action={withdrawParticipation}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="btn btn-ghost text-sm text-[var(--color-accent)]"
                      >
                        Withdraw
                      </button>
                    </form>
                  )}
                </div>

                {isCancelledEvent(ev) && (
                  <p className="mt-3 rounded-lg bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-ink)]">
                    This event has been cancelled{ev?.cancel_reason ? `: ${ev.cancel_reason}` : "."} There&apos;s nothing
                    you need to do.
                    {codeByParticipation.has(p.id)
                      ? " Your discount code may no longer be usable — the organiser's ticketing platform decides that."
                      : ""}
                  </p>
                )}

                {/* Book → selected → upload → attend → reward, with ticks
                    (3 Aug standup). */}
                <div className="mt-4 rounded-xl border border-black/10 p-4">
                  <ParticipationProgress
                    steps={participationSteps(p, {
                      surveyDone: surveyDone(p),
                      hasCode: codeByParticipation.has(p.id),
                      codeWait: codeByParticipation.has(p.id) ? null : codeWaitFor(p),
                    })}
                    rejected={p.status === "rejected"}
                    ticketHref={ticketLinks.get(p.id)}
                    ticketIsImage={isImagePath(p.ticket_proof_url)}
                  />
                </div>

                {ev?.reward_rules && (
                  <div className="mt-3 rounded-xl bg-[var(--color-mist)] px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--color-brand-dark)]">
                      Reward:
                    </span>{" "}
                    {ev.reward_rules}
                    {ev.participation_deadline && (
                      <span className="mt-1 block text-xs text-[var(--color-ink-soft)]">
                        Register by: {formatDateTime(ev.participation_deadline)}
                      </span>
                    )}
                  </div>
                )}

                {ev?.campaign_id &&
                  surveyTemplates
                    .filter((t) => t.campaign_id === ev.campaign_id)
                    .filter(
                      (t) =>
                        t.kind === "pre_event" ||
                        p.status === "attendance_verified" ||
                        p.status === "reward_released",
                    )
                    .map((t) => {
                      const completed = respondedKeys.has(`${t.id}:${p.id}`) || respondedPublicly.has(t.id);
                      return (
                        <div key={t.id} className="mt-4">
                          {completed ? (
                            <p className="text-sm text-[var(--color-olive-deep)]">
                              ✓ {t.kind === "pre_event" ? "Pre-event" : "Post-event"} survey
                              completed — thank you!
                              {!codeByParticipation.has(p.id) &&
                                !codeWaitFor(p) &&
                                " Your discount code appears here as soon as it's released."}
                            </p>
                          ) : (
                            <Link
                              // /survey/[id] serves a registered participant the
                              // same form and opens before email verification,
                              // which blocks every /dashboard/* page but the
                              // home (QA 30 Oct #9). It only takes public
                              // pre-event surveys, so the rest stay here.
                              href={
                                t.is_public && t.kind === "pre_event"
                                  ? `/survey/${t.id}`
                                  : `/dashboard/surveys/${t.id}`
                              }
                              className="btn btn-primary text-sm"
                            >
                              Take the {t.kind === "pre_event" ? "pre-event" : "post-event"}{" "}
                              survey
                            </Link>
                          )}
                        </div>
                      );
                    })}

                {(() => {
                  // Answered, no code: say plainly what happens next.
                  if (codeByParticipation.has(p.id) || !surveyDone(p)) return null;
                  const wait = codeWaitFor(p);
                  if (!wait) return null;
                  const copy: Record<CodeWait, { tone: string; text: string }> = {
                    review: {
                      tone: "bg-[var(--color-gold)]/40",
                      text: "⏳ Your survey response is under review. We'll get back to you shortly — if everything is fine, your discount code will be emailed to you and will appear in My rewards. There's nothing you need to do.",
                    },
                    setup: {
                      tone: "bg-[var(--color-sage)]/60",
                      text: "✓ Your response passed. Your discount code is being set up — we'll email it to you as soon as it's issued, and it will appear in My rewards.",
                    },
                    declined: {
                      tone: "bg-[var(--color-mist)]",
                      text: "We reviewed your survey response and weren't able to approve it, so no discount code was issued for it. If you think that's wrong, tell us using the Feedback button.",
                    },
                  };
                  return (
                    <p className={`mt-4 rounded-xl px-4 py-3 text-sm text-[var(--color-ink)] ${copy[wait].tone}`} data-testid="code-wait" data-reason={wait}>
                      {copy[wait].text}
                    </p>
                  );
                })()}

                {(() => {
                  const c = codeByParticipation.get(p.id);
                  if (!c) return null;
                  const platform = platformLabel(c.redemption_platform);
                  const expired = c.status === "issued" && !!c.expires_at && new Date(c.expires_at) < new Date();
                  return (
                    <div className="mt-4 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3" data-testid="event-reward-code">
                      <p className="text-sm font-semibold text-[var(--color-olive-deep)]">
                        🎟 Your discount code{c.value_label ? ` · ${c.value_label}` : ""}
                        {platform ? ` · redeem on ${platform}` : ""}
                      </p>
                      <p className="mt-2 inline-block max-w-full break-all rounded-lg bg-white px-3 py-1.5 font-mono text-lg tracking-wide">
                        {c.code}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        {c.status === "redeemed" ? "Marked as redeemed. " : ""}
                        {c.expires_at &&
                          `${expired ? "Expired" : "Use by"} ${new Date(c.expires_at).toLocaleDateString("en-GB", { timeZone: UK_TIME_ZONE })} · `}
                        <Link href="/dashboard/rewards" className="underline">
                          How to use it
                        </Link>
                      </p>
                    </div>
                  );
                })()}

                {/* Registered, survey not answered yet (Testing notes 7 Nov: no draw or
                    ticket upload any more — the survey is the next step). */}
                {p.status === "registered" && !surveyDone(p) && !codeByParticipation.has(p.id) && (
                  <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
                    ⏳ You&apos;re registered — answer the survey above to get your discount code.
                  </p>
                )}

                {p.status === "ticket_uploaded" && (
                  <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
                    ✅ Ticket uploaded. Your attendance will be verified at the
                    venue.
                  </p>
                )}

                {p.status === "attendance_verified" && !codeByParticipation.has(p.id) && !surveyDone(p) && (
                  <p className="mt-4 text-sm text-[var(--color-purple-deep)]">
                    🎉 You&apos;re checked in — this event is now in your Event Passport. Complete the survey to receive
                    your discount code.
                  </p>
                )}

                {p.status === "reward_released" && !codeByParticipation.has(p.id) && (
                  <p className="mt-4 text-sm text-[var(--color-olive-deep)]">
                    🎟 Your discount code is ready —{" "}
                    <Link href="/dashboard/rewards" className="font-semibold underline">
                      see My rewards
                    </Link>
                    .
                  </p>
                )}

                {/* The "not selected" message is part of the step tracker
                    above, so it isn't repeated here. */}

                {/* Marketing consent. The payout-details consent went with the
                    cash reward (9 Oct standup: rewards are discount codes). */}
                {/* Everyone registered can change this — not just "selected"
                    people (selection is gone; marketing unsubscribe pages point
                    here to opt back in, 0116). */}
                {p.status !== "rejected" && partnerMarketingAll && (
                  <p className="mt-4 rounded-xl border border-black/10 p-4 text-sm text-[var(--color-ink-soft)]">
                    You&apos;re signed up for newsletters &amp; promotions from our partner brands. You can turn that
                    off any time in your{" "}
                    <Link href="/dashboard/profile#partner-marketing" className="underline">
                      profile
                    </Link>
                    .
                  </p>
                )}
                {p.status !== "rejected" && !partnerMarketingAll && (
                  <form
                    action={provideConsent}
                    className="mt-4 grid gap-2 rounded-xl border border-black/10 p-4 text-sm"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <p className="font-semibold">Hear from our partner brands</p>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="newsletter_opt_in"
                        defaultChecked={p.newsletter_opt_in}
                        className="h-4 w-4"
                      />
                      Sign me up for newsletters &amp; promotions from all Live·En·Synergy partner brands
                    </label>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      One choice for every brand whose events you join. Turn it off any time in your profile, or with
                      the unsubscribe link in any email.
                    </p>
                    <div>
                      <button type="submit" className="btn btn-ghost text-sm">
                        Save preferences
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card mt-6 p-5">
        <h2 className="font-semibold text-[var(--color-ink)]">
          A few quick things to note
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--color-ink-soft)]">
          <li>Answer each event&apos;s short survey here once it opens — the button appears on the event.</li>
          <li>
            We check every response. When yours passes, your discount code shows on the event and under My rewards,
            and we email it to you.
          </li>
          <li>Use the code when you buy your ticket on the event&apos;s ticketing site, before it expires.</li>
          <li>
            On the day, remember to check in at the venue by scanning the QR code — every event you check in at is
            added to your Event Passport above.
          </li>
          <li>Your personal details are never shared with any partner without your consent.</li>
        </ul>
      </div>
    </div>
  );
}

function TabLink({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
        active
          ? "bg-[var(--color-ink)] text-white"
          : "bg-[var(--color-mist)] text-[var(--color-ink-soft)] hover:bg-black/5"
      }`}
    >
      {label}
      <span className="ml-2 opacity-70">{count}</span>
    </Link>
  );
}
