import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { CAMPAIGN_CLOSE_REASONS, CAMPAIGN_STATUS_LABELS, type CampaignStage } from "@/lib/campaign-stage";
import type { CampaignStatus } from "@/lib/types";
import { changeCampaignStatus } from "../marketplace-actions";

const UNPAID = ["draft", "sent", "overdue"];

/**
 * Complete… / Close… / Reopen… for one campaign (0066, FB-00031). Each opens
 * a small form, and submitting it first shows a popup spelling out what will
 * happen given where the campaign is now — what it overrides, what it cancels,
 * who is told (client request, 13 Oct). Reasons and notes are recorded in
 * campaign_status_events and shown to admins only.
 */
export function CampaignStatusActions({
  campaignId,
  reference,
  status,
  stage,
  openProposals,
  settledEvent,
  invoice,
  surveyPublished,
  reopenTo,
  returnTo,
}: {
  campaignId: string;
  reference: string;
  status: CampaignStatus;
  stage: CampaignStage;
  /** Proposals nobody agreed yet — completing or closing withdraws them. */
  openProposals: number;
  /** The agreed sponsorship, if any — finishing the campaign leaves it alone. */
  settledEvent: { name: string; status: string } | null;
  /** The campaign's package invoice that isn't cancelled, if any. */
  invoice: { reference: string; status: string } | null;
  surveyPublished: boolean;
  /** Where Reopen goes back to, when known from the status history. */
  reopenTo: CampaignStatus | null;
  returnTo: string;
}) {
  const proposals =
    openProposals > 0
      ? `Withdraw ${openProposals} proposal${openProposals === 1 ? "" : "s"} nobody agreed yet, free the listing${openProposals === 1 ? "" : "s"} and tell the artist${openProposals === 1 ? "" : "s"}.`
      : null;
  const unpaidInvoice = invoice && UNPAID.includes(invoice.status) ? invoice : null;
  const paidInvoice = invoice?.status === "paid" ? invoice : null;

  // --- Complete -----------------------------------------------------------
  const completeWarnings = [
    stage.key !== "live" &&
      `It isn't Live yet — it's at “${stage.label}”. Completing now skips the remaining steps.`,
    settledEvent &&
      settledEvent.status !== "completed" &&
      `${settledEvent.name} hasn't been marked completed by the brand or artist yet.`,
    !settledEvent && "No event was ever agreed for this campaign.",
    unpaidInvoice && `Invoice ${unpaidInvoice.reference} is still unpaid — completing doesn't cancel it.`,
  ].filter((x): x is string => !!x);
  const completePoints = [
    `Change ${reference} from “${stage.label}” to Completed (dark green). The brand sees “Completed” and gets a notification.`,
    proposals,
    "Leave the agreed event, its participants, codes and surveys exactly as they are.",
    "Keep your note for admins only. You can reopen it later.",
  ].filter((x): x is string => !!x);

  // --- Close --------------------------------------------------------------
  const closeWarnings = [
    status === "in_progress" &&
      (stage.key === "live"
        ? "This campaign is Live — the event, participants and discount codes are in use."
        : `This campaign is ongoing (“${stage.label}”) — you're stopping it part-way.`),
    settledEvent &&
      `${settledEvent.name} stays agreed and goes ahead unless you cancel it separately on its event page.`,
    paidInvoice && `Invoice ${paidInvoice.reference} is paid — closing doesn't refund it (refunds are on the invoice page).`,
    surveyPublished && "Its published survey stays open — archive it in Surveys if responses should stop.",
  ].filter((x): x is string => !!x);
  const closePoints = [
    `Change ${reference} from “${stage.label}” to Closed (grey). The brand sees “Closed” and gets a notification — not the reason.`,
    status === "awaiting_payment" && unpaidInvoice
      ? `Cancel invoice ${unpaidInvoice.reference}${unpaidInvoice.status === "draft" ? "" : ", void it in Stripe and tell the brand there's nothing to pay"}.`
      : null,
    status === "in_progress" && !settledEvent ? "Take it off artists' Discover campaigns list." : null,
    proposals,
    "Record the reason and note for admins only. Reopening later puts it back where it was.",
  ].filter((x): x is string => !!x);

  // --- Reopen -------------------------------------------------------------
  const reopenPoints = [
    reopenTo
      ? `Change ${reference} from ${CAMPAIGN_STATUS_LABELS[status]} back to ${CAMPAIGN_STATUS_LABELS[reopenTo]}${
          reopenTo === "awaiting_payment" ? " — it was closed before being paid, so it stays behind the payment gate" : ""
        }. The brand gets a notification.`
      : `Change ${reference} from ${CAMPAIGN_STATUS_LABELS[status]} back to In progress — or Awaiting payment if it was never paid. The brand gets a notification.`,
    reopenTo === "awaiting_payment"
      ? "Its cancelled invoice stays cancelled — draft and send a new one."
      : "If no event is agreed yet, it reappears on artists' Discover campaigns list.",
    "Not restore withdrawn proposals or cancelled invoices.",
  ];

  const hidden = (action: string) => (
    <>
      <input type="hidden" name="id" value={campaignId} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="return_to" value={returnTo} />
    </>
  );

  return (
    <div className="flex w-64 flex-col gap-2 text-left">
      {status === "in_progress" && (
        <details>
          <summary className="btn btn-ghost w-full cursor-pointer text-sm">Complete…</summary>
          <form action={changeCampaignStatus} className="mt-2 space-y-2 rounded-xl border border-black/10 p-3 text-xs">
            {hidden("complete")}
            <p className="text-[var(--color-ink-soft)]">
              Marks the campaign finished — use once the event has happened and reporting is done.
            </p>
            <textarea
              name="note"
              rows={2}
              maxLength={1000}
              className="textarea text-sm"
              placeholder="Note for the team (optional, admins only)"
            />
            <ConfirmSubmitButton
              label="Mark completed…"
              className="btn btn-primary w-full text-sm"
              title={`Complete ${reference}?`}
              warnings={completeWarnings}
              points={completePoints}
              confirmLabel="Yes, mark completed"
            />
          </form>
        </details>
      )}

      {(status === "in_progress" || status === "awaiting_payment") && (
        <details>
          <summary className="btn btn-ghost w-full cursor-pointer text-sm">Close…</summary>
          <form action={changeCampaignStatus} className="mt-2 space-y-2 rounded-xl border border-black/10 p-3 text-xs">
            {hidden("close")}
            <p className="text-[var(--color-ink-soft)]">
              Stops the campaign before it finishes. The reason and note are for admins only.
            </p>
            <select name="reason" required defaultValue="" className="select text-sm">
              <option value="" disabled>
                Why is it closing?
              </option>
              {CAMPAIGN_CLOSE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <textarea
              name="note"
              rows={2}
              maxLength={1000}
              className="textarea text-sm"
              placeholder="Note (optional — required for Other)"
            />
            <ConfirmSubmitButton
              label="Close campaign…"
              className="btn btn-dark w-full text-sm"
              title={`Close ${reference}?`}
              warnings={closeWarnings}
              points={closePoints}
              confirmLabel="Yes, close it"
              danger
            />
          </form>
        </details>
      )}

      {(status === "completed" || status === "closed") && (
        <details>
          <summary className="btn btn-ghost w-full cursor-pointer text-sm">Reopen…</summary>
          <form action={changeCampaignStatus} className="mt-2 space-y-2 rounded-xl border border-black/10 p-3 text-xs">
            {hidden("reopen")}
            <textarea
              name="note"
              rows={2}
              maxLength={1000}
              className="textarea text-sm"
              placeholder="Why it's being reopened (optional, admins only)"
            />
            <ConfirmSubmitButton
              label="Reopen campaign…"
              className="btn btn-primary w-full text-sm"
              title={`Reopen ${reference}?`}
              warnings={[`You're overriding a ${CAMPAIGN_STATUS_LABELS[status].toLowerCase()} campaign.`]}
              points={reopenPoints}
              confirmLabel="Yes, reopen"
            />
          </form>
        </details>
      )}
    </div>
  );
}
