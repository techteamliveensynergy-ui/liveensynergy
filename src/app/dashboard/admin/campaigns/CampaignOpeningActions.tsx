import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { isCampaignOpen } from "@/lib/campaign-progress";
import { formatDateTime } from "@/lib/format";
import type { CampaignStatus } from "@/lib/types";
import { setCampaignOpening } from "../marketplace-actions";

/**
 * Opening a campaign to the audience (0070, 14 Oct standup). Once paid and
 * agreed, its event shows to the audience as "Upcoming"; registration and the
 * survey open only from here — now, or on a scheduled date timed to the
 * event's promotion. Opening before the codes are confirmed and a survey is
 * published needs a written reason (kept in the admin audit log).
 */
export function CampaignOpeningActions({
  campaignId,
  reference,
  status,
  opensAt,
  overrideReason,
  settledEvent,
  surveyPublished,
  returnTo,
}: {
  campaignId: string;
  reference: string;
  status: CampaignStatus;
  opensAt: string | null;
  overrideReason: string | null;
  settledEvent: { name: string; reward_codes_confirmed_at: string | null } | null;
  surveyPublished: boolean;
  returnTo: string;
}) {
  const open = isCampaignOpen(opensAt);
  const scheduled = !!opensAt && !open;

  const missing = [
    !settledEvent && "No event is agreed yet.",
    settledEvent && !settledEvent.reward_codes_confirmed_at && "The artist hasn't confirmed the discount codes.",
    !surveyPublished && "No survey is published for this campaign.",
  ].filter((x): x is string => !!x);
  const ready = missing.length === 0;

  const hidden = (action: string) => (
    <>
      <input type="hidden" name="id" value={campaignId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="return_to" value={returnTo} />
    </>
  );

  const openPoints = (when: string) =>
    [
      `Let the audience register for ${settledEvent?.name ?? "the event"} and take the campaign survey ${when}.`,
      "Until then it keeps showing as upcoming, with registration and the survey closed.",
      settledEvent && "Tell the brand and the artist.",
      !ready && "Record your reason in the admin audit log.",
    ].filter((x): x is string => !!x);

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Registration and survey</h2>
      <p className="mt-1 text-sm">
        {open ? (
          <span className="font-semibold text-[var(--color-olive-deep)]">Open since {formatDateTime(opensAt)}.</span>
        ) : scheduled ? (
          <span className="font-semibold">Scheduled to open {formatDateTime(opensAt)}.</span>
        ) : (
          <span className="font-semibold">Not open yet.</span>
        )}{" "}
        <span className="text-[var(--color-ink-soft)]">
          {open
            ? "The audience can register and take the survey."
            : settledEvent
              ? "The event shows to the audience as upcoming; registration and the survey are closed."
              : "Nothing shows to the audience until an event is agreed."}
        </span>
      </p>
      {overrideReason && (open || scheduled) && (
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Opened before it was ready: {overrideReason}</p>
      )}

      {status !== "in_progress" ? (
        <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
          {status === "awaiting_payment" ? "Can be opened once the campaign is paid." : "This campaign has finished."}
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {!open && (
            <div className="space-y-3">
              {missing.length > 0 && (
                <ul className="space-y-1 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm">
                  {missing.map((m) => (
                    <li key={m}>• {m}</li>
                  ))}
                </ul>
              )}
              <form action={setCampaignOpening} className="space-y-2 rounded-xl border border-black/10 p-3 text-sm">
                {hidden("open")}
                {!ready && (
                  <textarea
                    name="reason"
                    rows={2}
                    maxLength={1000}
                    required
                    className="textarea text-sm"
                    placeholder="Why open it before it's ready? (required, admins only)"
                  />
                )}
                <ConfirmSubmitButton
                  label="Open now…"
                  className="btn btn-primary w-full text-sm"
                  title={`Open ${reference} now?`}
                  warnings={missing}
                  points={openPoints("straight away")}
                  confirmLabel="Yes, open now"
                />
              </form>
              <form action={setCampaignOpening} className="space-y-2 rounded-xl border border-black/10 p-3 text-sm">
                {hidden("schedule")}
                <label className="field-label" htmlFor={`opens-at-${campaignId}`}>
                  {scheduled ? "Change the opening (UK time)" : "Or schedule it (UK time)"}
                </label>
                <input id={`opens-at-${campaignId}`} type="datetime-local" name="opens_at" required className="input" />
                {!ready && (
                  <textarea
                    name="reason"
                    rows={2}
                    maxLength={1000}
                    required
                    className="textarea text-sm"
                    placeholder="Why schedule it before it's ready? (required, admins only)"
                  />
                )}
                <ConfirmSubmitButton
                  label="Schedule…"
                  className="btn btn-ghost w-full text-sm"
                  title={`Schedule ${reference} to open?`}
                  warnings={missing}
                  points={openPoints("from the date you picked")}
                  confirmLabel="Yes, schedule it"
                />
              </form>
            </div>
          )}
          {(open || scheduled) && (
            <form action={setCampaignOpening} className="space-y-2 self-start rounded-xl border border-black/10 p-3 text-sm">
              {hidden("close")}
              <p className="text-[var(--color-ink-soft)]">
                {open
                  ? "Stops new registrations and pre-event survey responses. Anyone already registered stays registered, and post-event surveys stay open to them."
                  : "Cancels the scheduled opening; it stays upcoming until you open it again."}
              </p>
              <ConfirmSubmitButton
                label={open ? "Close registrations…" : "Cancel scheduled opening…"}
                className="btn btn-ghost w-full text-sm"
                title={open ? `Close registrations for ${reference}?` : `Cancel the scheduled opening of ${reference}?`}
                points={[
                  "Show the event as upcoming again, with registration and the survey closed.",
                  "Keep existing registrations, survey responses and codes as they are.",
                  "Not notify anyone.",
                ]}
                confirmLabel={open ? "Yes, close registrations" : "Yes, cancel it"}
                danger
              />
            </form>
          )}
        </div>
      )}
    </section>
  );
}
