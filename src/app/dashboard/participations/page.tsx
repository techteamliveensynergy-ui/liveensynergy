import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import {
  ParticipationProgress,
  isImagePath,
  participationSteps,
} from "@/components/dashboard/ParticipationProgress";
import { signedUrlFor } from "@/lib/storage";
import { FileDrop } from "@/components/ui/FileDrop";
import { ATTACHMENT_HINT, MAX_ATTACHMENT_BYTES } from "@/lib/upload-limits";
import type { Participation, SponsoredEvent, SurveyTemplate } from "@/lib/types";
import { formatEventDateTime } from "@/lib/event-time";
import { addDays, formatDateTime } from "@/lib/format";
import {
  uploadTicketProof,
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

  // Surveys tied to this audience member's campaigns. RLS (migration 0033)
  // already scopes survey_templates reads to eligible respondents, so no
  // extra campaign filter is needed on the query itself.
  const campaignIds = Array.from(
    new Set(allRows.map((r) => r.sponsored_events?.campaign_id).filter((id): id is string => Boolean(id))),
  );
  const [{ data: surveyTemplateRows }, { data: surveyResponseRows }] = await Promise.all([
    campaignIds.length > 0
      ? supabase
          .from("survey_templates")
          .select("id, campaign_id, kind, title")
          .in("campaign_id", campaignIds)
          .eq("status", "published")
      : Promise.resolve({ data: [] as SurveyTemplate[] }),
    allRows.length > 0
      ? supabase
          .from("survey_responses")
          .select("template_id, participation_id")
          .in(
            "participation_id",
            allRows.map((r) => r.id),
          )
      : Promise.resolve({ data: [] as { template_id: string; participation_id: string }[] }),
  ]);
  const surveyTemplates = (surveyTemplateRows ?? []) as Pick<
    SurveyTemplate,
    "id" | "campaign_id" | "kind" | "title"
  >[];
  const respondedKeys = new Set(
    (surveyResponseRows ?? []).map((r) => `${r.template_id}:${r.participation_id}`),
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
          ✓ You&apos;re registered. Buy your ticket, then come back here and add
          your ticket reference so your attendance can be verified.
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
      {notice === "survey-submitted" && (
        <p className="mb-5 rounded-lg bg-[var(--color-sage)] px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          ✓ Thanks — your survey response has been recorded.
        </p>
      )}
      {notice === "survey-already-submitted" && (
        <p className="mb-5 rounded-lg bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
          You&apos;d already completed that survey.
        </p>
      )}

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
              : "Discover events with sponsor-funded rewards and register to attend."
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
              <div key={p.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{ev?.name ?? "Event"}</h3>
                      <StatusBadge status={p.status} />
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

                {/* Book → selected → upload → attend → reward, with ticks
                    (3 Aug standup). */}
                <div className="mt-4 rounded-xl border border-black/10 p-4">
                  <ParticipationProgress
                    steps={participationSteps(p)}
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
                        Participation deadline: {formatDateTime(ev.participation_deadline)}
                        {" · "}Selection to be confirmed by:{" "}
                        {formatDateTime(addDays(ev.participation_deadline, 7))}
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
                      const completed = respondedKeys.has(`${t.id}:${p.id}`);
                      return (
                        <div key={t.id} className="mt-4">
                          {completed ? (
                            <p className="text-sm text-[var(--color-olive-deep)]">
                              ✓ {t.kind === "pre_event" ? "Pre-event" : "Post-event"} survey
                              completed — thank you!
                            </p>
                          ) : (
                            <Link
                              href={`/dashboard/surveys/${t.id}`}
                              className="btn btn-primary text-sm"
                            >
                              Take the {t.kind === "pre_event" ? "pre-event" : "post-event"}{" "}
                              survey
                            </Link>
                          )}
                        </div>
                      );
                    })}

                {/* Not yet selected — nothing to do until the sponsor confirms who's in. */}
                {p.status === "registered" && !p.selected && (
                  <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
                    ⏳ You&apos;re registered. We&apos;ll email you if you&apos;re
                    selected for the reward — it&apos;ll also show here.
                  </p>
                )}

                {/* Next step — only relevant once selection is confirmed. */}
                {p.status === "registered" && p.selected && (
                  <form action={uploadTicketProof} className="mt-4 space-y-3">
                    <input type="hidden" name="id" value={p.id} />
                    <div>
                      <p className="field-label">
                        Next Step: upload your ticket proof if and after your
                        selection has been confirmed
                      </p>
                      {p.selected_at && (
                        <p className="field-hint">
                          Upload by {formatDateTime(addDays(p.selected_at, 7))}
                        </p>
                      )}
                    </div>
                    <FileDrop
                      name="ticket_file"
                      accept="image/*,application/pdf"
                      allowedTypes={null}
                      maxBytes={MAX_ATTACHMENT_BYTES}
                      preview={false}
                      label="Upload your ticket (PDF or photo)"
                      hint={ATTACHMENT_HINT}
                    />
                    <button type="submit" className="btn btn-primary">
                      Upload ticket
                    </button>
                  </form>
                )}

                {p.status === "ticket_uploaded" && (
                  <p className="mt-4 text-sm text-[var(--color-ink-soft)]">
                    ✅ Ticket uploaded. Your attendance will be verified at the
                    venue.
                  </p>
                )}

                {p.status === "attendance_verified" && (
                  <p className="mt-4 text-sm text-[var(--color-purple-deep)]">
                    🎉 Attendance verified — your reward is being processed.
                  </p>
                )}

                {p.status === "reward_released" && (
                  <p className="mt-4 text-sm text-[var(--color-olive-deep)]">
                    💸 Reward released
                    {p.reward_amount_gbp != null
                      ? `: £${Number(p.reward_amount_gbp).toLocaleString("en-GB")}`
                      : ""}
                    .
                  </p>
                )}

                {/* The "not selected" message is part of the step tracker
                    above, so it isn't repeated here. */}

                {/* Consent / payout details */}
                {p.selected && (
                  <form
                    action={provideConsent}
                    className="mt-4 grid gap-2 rounded-xl border border-black/10 p-4 text-sm"
                  >
                    <input type="hidden" name="id" value={p.id} />
                    <p className="font-semibold">You&apos;ve been selected 🎯</p>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="bank_details_provided"
                        defaultChecked={p.bank_details_provided}
                        className="h-4 w-4"
                      />
                      I consent to share my payout details to receive the reward
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="newsletter_opt_in"
                        defaultChecked={p.newsletter_opt_in}
                        className="h-4 w-4"
                      />
                      Sign me up for the sponsor&apos;s newsletter &amp;
                      promotions
                    </label>
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
          <li>
            You&apos;ll be notified by email if you&apos;re selected for the
            reward — it&apos;ll also show on your Overview page when you log
            in to the Live·En·Synergy website.
          </li>
          <li>
            Selection happens within one week of the participation deadline.
            For example, if the participation deadline is 1 Jan 2026,
            selection is carried out before 8 Jan 2026 and selected
            participants are informed accordingly. If you don&apos;t hear
            anything by then, please assume you weren&apos;t selected on that
            occasion.
          </li>
          <li>
            If you&apos;re selected, buy your ticket as you normally would and
            upload the ticket proof. Your ticket upload window is open for one
            week (e.g. until 15 Jan 2026) — after that it expires and the spot
            is offered to someone else.
          </li>
          <li>
            Attend the event and confirm your presence — either by scanning a
            QR code at the venue, or the artist confirming directly when your
            ticket is scanned. The method for each event is noted on its event
            details.
          </li>
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
