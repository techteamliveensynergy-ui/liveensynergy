import type { Participation } from "@/lib/types";

/**
 * The step tracker an audience member sees against each event they've joined
 * (3 Aug standup — the overview gave no sense of "where am I in this?", so
 * people couldn't tell whether their ticket upload had landed).
 *
 * The step names follow the platform's actual flow rather than the shorthand
 * used in the meeting: registering ("book") and being selected are separate
 * things here, and only selected participants are asked for a ticket.
 */

export interface ProgressStep {
  label: string;
  hint?: string;
  state: "done" | "current" | "todo";
}

/**
 * Derives the steps from a participation row, plus what the row itself can't
 * say: whether this person has answered the event's survey, and whether a
 * discount code exists for them.
 *
 * "current" is the first step that hasn't happened yet — that's the one the
 * user either has to act on or is waiting on someone else for.
 *
 * QA 30 Oct #21: the tracker had no survey step, so "Code issued" sat next
 * to "Attended" with nothing explaining the gap; "Selected" claimed a random
 * draw when the team can also pick by hand; and a code released by the
 * survey (0075) left the participation at attendance_verified, so the last
 * step stayed open while the code was already under My rewards.
 */
export function participationSteps(
  p: Participation,
  extra: { surveyDone?: boolean; hasCode?: boolean } = {},
): ProgressStep[] {
  const verified = ["attendance_verified", "reward_released"].includes(p.status);
  const rewarded = p.status === "reward_released" || Boolean(extra.hasCode);
  const surveyed = Boolean(extra.surveyDone) || rewarded;
  // Attendance can be verified at the venue without a ticket upload; a
  // verified attendee has evidently got past the ticket step.
  const uploaded =
    Boolean(p.ticket_proof_url) ||
    p.status === "ticket_uploaded" ||
    verified;

  const done = [true, p.selected || verified, uploaded, verified, surveyed, rewarded];
  const labels: { label: string; hint?: string }[] = [
    { label: "Registered", hint: "You signed up for this event" },
    { label: "Selected", hint: "The Live·En·Synergy team chooses who takes part — we'll email you" },
    { label: "Ticket uploaded", hint: "Upload your ticket as proof" },
    { label: "Attended", hint: "Scan the QR code at the venue" },
    { label: "Survey", hint: "Answer the event's short survey — the button appears under My events when it opens" },
    {
      label: "Discount code",
      hint: "Released once your survey passes our quality check and the event's discount codes are confirmed — then it's under My rewards",
    },
  ];

  const firstPending = done.indexOf(false);

  return labels.map((l, i) => ({
    ...l,
    state: done[i] ? "done" : i === firstPending ? "current" : "todo",
  }));
}

/**
 * The badge next to an event on the audience's own pages. The stored status
 * lags what they've been told: selection doesn't change it (still
 * "registered"), and a survey-released code doesn't either (#21).
 */
export function participationBadge(p: Participation, hasCode = false): string {
  if (p.status === "rejected") return "rejected";
  if (hasCode || p.status === "reward_released") return "code_issued";
  if (p.status === "registered" && p.selected) return "selected";
  return p.status;
}

/** Tickets are routinely PDFs, which an `<img>` can't render. */
export function isImagePath(path: string | null | undefined) {
  return Boolean(path && /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(path));
}

export function ParticipationProgress({
  steps,
  ticketHref,
  ticketIsImage = false,
  rejected = false,
  compact = false,
}: {
  steps: ProgressStep[];
  /** Signed link to the uploaded ticket, when there is one. */
  ticketHref?: string | null;
  /** Whether that link points at something an `<img>` can show. */
  ticketIsImage?: boolean;
  /** Not selected this time — the tracker stops rather than pretending. */
  rejected?: boolean;
  /** Drops the per-step hints, for the denser overview cards. */
  compact?: boolean;
}) {
  if (rejected) {
    return (
      <p className="rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm text-[var(--color-ink-soft)]">
        You weren&apos;t selected for the reward this time — thanks for
        registering.
      </p>
    );
  }

  // The current step, for the single hint line under the tracker.
  const current = steps.find((s) => s.state === "current");

  return (
    <div>
      {/*
        A fixed column per step rather than a wrapping flex row. Wrapping left
        the last connector on a row dangling into empty space and orphaned the
        final step underneath, which read as broken layout.

        Each connector is absolutely positioned from the previous circle's
        centre to this one's (`-left-1/2 w-full`), so it can only ever exist
        *between* two steps — there's nothing to leave hanging.
      */}
      <ol
        className="grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="relative flex flex-col items-center px-0.5 text-center"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute -left-1/2 top-3.5 h-0.5 w-full ${
                  step.state === "done"
                    ? "bg-[var(--color-olive)]"
                    : "bg-black/10"
                }`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                step.state === "done"
                  ? "bg-[var(--color-olive)] text-white"
                  : step.state === "current"
                    ? "bg-[var(--color-gold)] text-[var(--color-ink)] ring-2 ring-[var(--color-brand)]/40"
                    : "bg-black/5 text-[var(--color-ink-soft)]"
              }`}
            >
              {step.state === "done" ? "✓" : i + 1}
            </span>
            <span
              className={`mt-1.5 text-[11px] leading-tight ${
                step.state === "todo"
                  ? "text-[var(--color-ink-soft)]"
                  : "font-semibold text-[var(--color-ink)]"
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      {/* One hint for the step they're actually on, rather than squeezing it
          into a column narrow enough to hold "Ticket uploaded". */}
      {!compact && current?.hint && (
        <p className="mt-2.5 text-center text-xs text-[var(--color-ink-soft)]">
          Next: {current.hint}
        </p>
      )}

      {ticketHref && (
        <a
          href={ticketHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-3 rounded-xl border border-black/10 p-2 transition hover:bg-[var(--color-mist)]"
        >
          {ticketIsImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ticketHref}
              alt="Your uploaded ticket"
              className="h-14 w-14 shrink-0 rounded-lg border border-black/10 bg-white object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-14 w-14 shrink-0 place-items-center rounded-lg border border-black/10 bg-white text-2xl"
            >
              🎟️
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--color-ink)]">
              Your uploaded ticket
            </span>
            <span className="block text-xs text-[var(--color-ink-soft)]">
              Open full size ↗
            </span>
          </span>
        </a>
      )}
    </div>
  );
}
