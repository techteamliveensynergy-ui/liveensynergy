import { isCampaignOpen } from "@/lib/campaign-progress";
import { formatDate } from "@/lib/format";
import type { CampaignStatus } from "@/lib/types";
import { fulfilmentOf, fulfilmentStatusText, type FulfilmentSummary } from "@/lib/fulfilment-forms";

/**
 * The facts behind a campaign's stage, each spelled out as done (✓), awaited
 * (⏳ — and by whom) or not yet due (○). Client feedback, 13 Oct: the admin
 * row showed "Needs matching" next to a "Matched" chip and couldn't tell what
 * was done and what was outstanding. The stage badge itself is unchanged.
 */

export type ChecklistState = "done" | "awaited" | "later";

export interface ChecklistItem {
  key: string;
  state: ChecklistState;
  text: string;
}

export interface CampaignChecklistFacts {
  status: CampaignStatus;
  paymentWaived: boolean;
  orderForm: { reference: string; status: string } | null;
  /** The campaign's package invoice that isn't cancelled, if any. */
  invoice: { reference: string; status: string } | null;
  events: {
    name: string;
    status: string;
    brand_agreed: boolean;
    artist_agreed: boolean;
    reward_codes_confirmed_at: string | null;
    /** Embedded fulfilment form (0082), when `fulfilmentTracked`. */
    artist_fulfilment_forms?: FulfilmentSummary | FulfilmentSummary[] | null;
  }[];
  /** The events above were loaded with their fulfilment forms. Off, the
   *  checklist skips that step rather than claiming nothing was started. */
  fulfilmentTracked?: boolean;
  surveyPublished: boolean;
  /** campaigns.opens_at (0070). */
  opensAt: string | null;
}

export function campaignChecklist(f: CampaignChecklistFacts): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const unpaid = f.status === "awaiting_payment";

  // Order form — only once one exists or the campaign still needs paying
  // (campaigns from before order forms simply never had one).
  if (f.orderForm) {
    const r = f.orderForm.reference;
    items.push(
      f.orderForm.status === "approved"
        ? { key: "order", state: "done", text: `Order form ${r} approved by brand` }
        : f.orderForm.status === "sent"
          ? { key: "order", state: "awaited", text: `Order form ${r} sent — awaiting brand approval` }
          : f.orderForm.status === "changes_requested"
            ? { key: "order", state: "awaited", text: `Brand asked for changes to order form ${r} — awaiting you` }
            : { key: "order", state: "awaited", text: `Order form ${r} drafted — awaiting you to send it` },
    );
  } else if (unpaid) {
    items.push({ key: "order", state: "awaited", text: "No order form yet — awaiting you" });
  }

  // Payment
  if (f.paymentWaived) {
    items.push({ key: "payment", state: "done", text: "Payment waived" });
  } else if (f.invoice?.status === "paid") {
    items.push({ key: "payment", state: "done", text: `Invoice ${f.invoice.reference} paid` });
  } else if (f.invoice?.status === "sent" || f.invoice?.status === "overdue") {
    items.push({
      key: "payment",
      state: "awaited",
      text: `Invoice ${f.invoice.reference} ${f.invoice.status === "overdue" ? "overdue" : "sent"} — awaiting brand payment`,
    });
  } else if (f.invoice?.status === "draft") {
    items.push({ key: "payment", state: "awaited", text: `Invoice ${f.invoice.reference} drafted — awaiting you to send it` });
  } else if (unpaid) {
    items.push({ key: "payment", state: "awaited", text: "No invoice yet — awaiting you" });
  } else {
    items.push({ key: "payment", state: "done", text: "Open to artists (no payment due)" });
  }

  // Event
  const settled = f.events.find((e) => e.status === "confirmed" || e.status === "completed") ?? null;
  const open = f.events.filter((e) => e.status === "in_progress");
  if (settled) {
    items.push({ key: "event", state: "done", text: `Event agreed: ${settled.name}` });
  } else if (open.length === 1) {
    const e = open[0];
    const waitingOn = [!e.brand_agreed && "brand", !e.artist_agreed && "artist"].filter(Boolean).join(" and ");
    items.push({
      key: "event",
      state: "awaited",
      text: `Event suggested: ${e.name} — awaiting ${waitingOn || "confirmation"} to agree`,
    });
  } else if (open.length > 1) {
    items.push({ key: "event", state: "awaited", text: `${open.length} events suggested — awaiting brand and artist to agree one` });
  } else if (unpaid) {
    items.push({ key: "event", state: "later", text: "Event — once paid" });
  } else {
    items.push({ key: "event", state: "awaited", text: "No event suggested yet — awaiting you" });
  }

  // Discount codes
  if (settled?.reward_codes_confirmed_at) {
    items.push({ key: "codes", state: "done", text: "Discount codes confirmed by artist" });
  } else if (settled) {
    items.push({ key: "codes", state: "awaited", text: "Discount codes — awaiting artist to confirm" });
  } else {
    items.push({ key: "codes", state: "later", text: "Discount codes — once an event is agreed" });
  }

  // Artist / organiser fulfilment form (0082)
  if (f.fulfilmentTracked && settled) {
    const { state, text } = fulfilmentStatusText(
      fulfilmentOf(settled.artist_fulfilment_forms),
      !!settled.reward_codes_confirmed_at,
    );
    items.push({ key: "fulfilment", state, text });
  } else if (f.fulfilmentTracked) {
    items.push({ key: "fulfilment", state: "later", text: "Artist fulfilment form — once an event is agreed" });
  }

  // Survey
  if (f.surveyPublished) {
    items.push({ key: "survey", state: "done", text: "Campaign survey published" });
  } else if (unpaid) {
    items.push({ key: "survey", state: "later", text: "Campaign survey — once paid" });
  } else {
    items.push({ key: "survey", state: "awaited", text: "Campaign survey not published — awaiting you" });
  }

  // Opening to the audience (0070)
  if (isCampaignOpen(f.opensAt)) {
    items.push({ key: "open", state: "done", text: `Open to the audience since ${formatDate(f.opensAt)}` });
  } else if (f.opensAt) {
    items.push({ key: "open", state: "done", text: `Scheduled to open ${formatDate(f.opensAt)}` });
  } else if (unpaid || !settled) {
    items.push({ key: "open", state: "later", text: "Registration and survey — open once the event is agreed and set up" });
  } else {
    items.push({ key: "open", state: "awaited", text: "Shown as upcoming — awaiting you to open registration and the survey" });
  }

  return items;
}

/** Green = done, yellow = still to do, dull grey = can't start yet. */
const STYLE: Record<ChecklistState, string> = {
  done: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  awaited: "bg-[var(--color-gold)]/70 text-[var(--color-ink)]",
  later: "bg-black/5 text-[var(--color-ink-soft)]",
};
const ICON: Record<ChecklistState, string> = { done: "✓", awaited: "•", later: "○" };
const SR: Record<ChecklistState, string> = { done: "Done:", awaited: "To do:", later: "Not yet:" };

export function CampaignChecklist({ facts }: { facts: CampaignChecklistFacts }) {
  return (
    <ul className="grid gap-1.5 text-sm sm:grid-cols-2" aria-label="What's done and what's still to do">
      {campaignChecklist(facts).map((i) => (
        <li key={i.key} className={`flex items-start gap-2 rounded-lg px-3 py-1.5 ${STYLE[i.state]}`}>
          <span aria-hidden className="font-bold">
            {ICON[i.state]}
          </span>
          <span className="sr-only">{SR[i.state]}</span>
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}
