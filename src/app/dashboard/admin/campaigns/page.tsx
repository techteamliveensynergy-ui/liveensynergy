import Link from "next/link";
import { ORDER_FORM_STATUS_LABELS, type OrderFormStatus } from "@/lib/order-forms";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { netForCampaign } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { waiveCampaignPayment } from "../marketplace-actions";
import { CampaignStatusActions } from "./CampaignStatusActions";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { campaignTitle } from "@/lib/campaign-requests";
import { CampaignStageBadge } from "@/components/campaigns/CampaignStageBadge";
import { CampaignChecklist } from "@/components/campaigns/CampaignChecklist";
import { CampaignStatusLegend } from "@/components/campaigns/CampaignStatusLegend";
import {
  CAMPAIGN_STAGE_LABELS,
  CAMPAIGN_STAGE_ORDER,
  campaignStage,
  closeReasonLabel,
  type CampaignStage,
  type CampaignStageKey,
} from "@/lib/campaign-stage";
import type { CampaignStatus } from "@/lib/types";
import { draftInvoiceForCampaign } from "../invoices/actions";
import { invoiceDisplayStatus } from "@/lib/billing";
import { MatchForm } from "./MatchForm";
import { OrderFormPicker } from "./OrderFormPicker";
import { formatEventDateTime } from "@/lib/event-time";

export const metadata = { title: "Campaigns · Admin" };


interface Row {
  id: string;
  reference: string;
  description: string;
  budget_gbp: number;
  category: string | null;
  preferred_location: string | null;
  preferred_timeline: string | null;
  reward_rules: string | null;
  suggested_event_note: string | null;
  suggested_event_url: string | null;
  status: CampaignStatus;
  created_at: string;
  matched_listing_id: string | null;
  package_platform_margin_gbp: number | null;
  payment_waived_at: string | null;
  payment_waived_reason: string | null;
  brand_id: string;
  target_name: string | null;
  campaign_name: string | null;
  category_other: string | null;
  opens_at: string | null;
  brands: { brand_name: string; profile_id: string } | null;
}

/** A campaign's live (non-cancelled) package invoice, for the status chip. */
interface InvoiceChip {
  id: string;
  campaign_id: string;
  status: string;
  reference: string;
  due_date: string | null;
}

/** A sponsored event standing against a campaign — one of possibly several. */
interface Suggestion {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
  brand_agreed: boolean;
  artist_agreed: boolean;
  event_date: string | null;
  reward_codes_confirmed_at: string | null;
}

/** The latest completed/closed record per campaign (admin-only, 0066). */
interface StatusEventRow {
  campaign_id: string;
  from_status: CampaignStatus;
  to_status: CampaignStatus;
  reason: string | null;
  note: string | null;
  created_at: string;
}

export default async function AdminCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    matched?: string;
    live?: string;
    stage?: string;
    status_updated?: string;
    invoice_error?: string;
    action_error?: string;
  }>;
}) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();

  const [
    { data: campaignRows },
    { data: listingRows },
    { data: suggestedRows },
    { count: pendingIntakeCount },
    { data: invoiceRows },
    { data: orderFormRows },
    { data: publishedSurveyRows },
    { data: statusEventRows },
  ] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("*, brands(brand_name, profile_id)")
        .order("created_at", { ascending: false }),
      supabase
        .from("event_listings")
        .select("id, name, city, event_date, start_time, timezone, budget_range")
        .eq("status", "available")
        .order("event_date", { ascending: true }),
      // Every event standing against a campaign — a campaign can carry several
      // suggestions at once, and admin needs to see which one was accepted.
      supabase
        .from("sponsored_events")
        .select(
          "id, name, status, campaign_id, brand_agreed, artist_agreed, event_date, reward_codes_confirmed_at",
        )
        .not("campaign_id", "is", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("campaign_intake_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "in_review"]),
      // Cancelled invoices don't count: cancelling is how a campaign is freed
      // to be re-drafted, so it reads as "No invoice" again.
      supabase
        .from("invoices")
        .select("id, campaign_id, status, reference, due_date")
        .eq("kind", "campaign_package")
        .neq("status", "cancelled"),
      supabase.from("campaign_order_forms").select("campaign_id, status, reference"),
      // For the stage badge: does the campaign have a published survey?
      supabase.from("survey_templates").select("campaign_id").eq("status", "published").not("campaign_id", "is", null),
      // Why each finished campaign was completed/closed (admin-only).
      supabase
        .from("campaign_status_events")
        .select("campaign_id, from_status, to_status, reason, note, created_at")
        .in("to_status", ["completed", "closed"])
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
  const orderForms = (orderFormRows ?? []) as { campaign_id: string; status: string; reference: string }[];
  const orderFormFor = (campaignId: string) => orderForms.find((f) => f.campaign_id === campaignId);

  let campaigns = (campaignRows ?? []) as Row[];
  const listings = ((listingRows ?? []) as {
    id: string;
    name: string;
    city: string | null;
    event_date: string | null;
    start_time: string | null;
    timezone: string;
    budget_range: string | null;
  }[]).map((l) => ({
    id: l.id,
    label: [l.name, l.city, l.event_date ? formatEventDateTime({ date: l.event_date, time: l.start_time, timeZone: l.timezone }) : null]
      .filter(Boolean)
      .join(" · "),
  }));

  const invoiceFor = (campaignId: string) =>
    ((invoiceRows ?? []) as InvoiceChip[]).find((i) => i.campaign_id === campaignId);

  const suggestions = (suggestedRows ?? []) as Suggestion[];
  const suggestionsFor = (campaignId: string) =>
    suggestions.filter((s) => s.campaign_id === campaignId);

  /** Already has a sponsorship the parties agreed to — nothing more to offer. */
  const isSettled = (campaignId: string) =>
    suggestionsFor(campaignId).some(
      (s) => s.status === "confirmed" || s.status === "completed",
    );

  const publishedSurvey = new Set(
    ((publishedSurveyRows ?? []) as { campaign_id: string }[]).map((t) => t.campaign_id),
  );
  const stageOf = new Map<string, CampaignStage>(
    campaigns.map((c) => {
      const mine = suggestionsFor(c.id);
      const settled = mine.find((s) => s.status === "confirmed" || s.status === "completed") ?? null;
      return [
        c.id,
        campaignStage({
          status: c.status,
          settled,
          openProposals: mine.filter((s) => s.status === "in_progress").length,
          surveyPublished: publishedSurvey.has(c.id),
          opensAt: c.opens_at,
        }),
      ];
    }),
  );
  const stageCounts = new Map<CampaignStageKey, number>();
  for (const st of stageOf.values()) stageCounts.set(st.key, (stageCounts.get(st.key) ?? 0) + 1);
  const finishedRecord = new Map<string, StatusEventRow>();
  for (const e of (statusEventRows ?? []) as StatusEventRow[]) {
    if (!finishedRecord.has(e.campaign_id)) finishedRecord.set(e.campaign_id, e);
  }

  if (sp.stage) campaigns = campaigns.filter((c) => stageOf.get(c.id)?.key === sp.stage);
  if (sp.status) campaigns = campaigns.filter((c) => c.status === sp.status);
  if (sp.matched === "no")
    campaigns = campaigns.filter((c) => !c.matched_listing_id);
  // "Live" = a sponsorship both parties agreed is running (Admin Portal
  // brief, 9 Oct: campaigns split into requests and live).
  if (sp.live === "yes") campaigns = campaigns.filter((c) => isSettled(c.id));
  if (sp.matched === "yes")
    campaigns = campaigns.filter((c) => c.matched_listing_id);

  const unmatched = ((campaignRows ?? []) as Row[]).filter(
    (c) => !c.matched_listing_id,
  ).length;

  const link = (params: Record<string, string>) => {
    const q = new URLSearchParams(params);
    return `/dashboard/admin/campaigns${q.toString() ? `?${q}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Campaigns live"
        subtitle={`Every campaign once a brand's request is accepted — awaiting payment, being matched, live and finished. ${unmatched} still need matching. Brand submissions are under Campaign requests.`}
        action={
          <Link
            href="/dashboard/admin/campaigns/intake"
            className="btn btn-primary"
          >
            Review requests{pendingIntakeCount ? ` (${pendingIntakeCount})` : ""}
          </Link>
        }
      />

      <OrderFormPicker
        campaigns={((campaignRows ?? []) as Row[]).map((c) => {
          const f = orderFormFor(c.id);
          return {
            id: c.id,
            reference: c.reference,
            label: c.campaign_name || c.target_name || (c.description ?? "").slice(0, 60) || "Untitled campaign",
            brandId: c.brand_id,
            brandName: c.brands?.brand_name ?? "Unnamed brand",
            formStatus: f ? ORDER_FORM_STATUS_LABELS[f.status as OrderFormStatus] : null,
          };
        })}
      />

      {sp.action_error && (
        <p className="mb-5 rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          {sp.action_error}
        </p>
      )}

      {sp.invoice_error && (
        <p className="mb-5 rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm text-[var(--color-accent)]">
          Couldn&apos;t draft the invoice: {sp.invoice_error}
        </p>
      )}

      {sp.status_updated && (
        <p role="status" className="mb-5 rounded-xl bg-[var(--color-sage)]/60 px-4 py-3 text-sm text-[var(--color-olive-deep)]">
          ✓ Campaign updated.
        </p>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href={link({})}
          className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
            !sp.status && !sp.matched && !sp.live && !sp.stage
              ? "bg-[var(--color-brand)] text-white"
              : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
          }`}
        >
          All
        </Link>
        {CAMPAIGN_STAGE_ORDER.map((key) => (
          <Link
            key={key}
            href={link({ stage: key })}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
              sp.stage === key
                ? "bg-[var(--color-brand)] text-white"
                : "border border-black/10 bg-white text-[var(--color-ink)] hover:bg-[var(--color-mist)]"
            }`}
          >
            {CAMPAIGN_STAGE_LABELS[key]} ({stageCounts.get(key) ?? 0})
          </Link>
        ))}
        {/* Older links (admin overview) filter by these; shown only while in use. */}
        {(sp.matched || sp.live || sp.status) && (
          <span className="rounded-full bg-[var(--color-brand)] px-3.5 py-1.5 text-sm font-semibold text-white">
            {sp.matched === "no"
              ? "Not matched"
              : sp.matched === "yes"
                ? "Matched"
                : sp.live === "yes"
                  ? "Event agreed"
                  : (CAMPAIGN_STAGE_LABELS as Record<string, string>)[sp.status ?? ""] ?? sp.status}
          </span>
        )}
      </div>

      {campaigns.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No campaigns match these filters.
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const net = netForCampaign(c);
            return (
              <div key={c.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/admin/campaigns/${c.id}`}
                        className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
                      >
                        {campaignTitle(c, "Untitled campaign")}
                      </Link>
                      <span className="text-sm text-[var(--color-ink-soft)]">
                        · {c.brands?.brand_name ?? "Unknown brand"}
                      </span>
                      <CampaignStageBadge stage={stageOf.get(c.id)!} />
                      {!c.campaign_name?.trim() && (
                        <Link
                          href={`/dashboard/admin/campaigns/${c.id}/edit`}
                          className="rounded-full bg-[var(--color-gold)]/70 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-ink)] hover:underline"
                          title="Brands see this campaign's code until it has a name"
                        >
                          + Add a campaign name
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                      {c.description}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      Ref {c.reference} · £
                      {Number(c.budget_gbp).toLocaleString("en-GB")} gross
                      {net != null &&
                        ` · £${Math.round(net).toLocaleString("en-GB")} net`}
                      {c.category ? ` · ${c.category}` : ""}
                      {c.preferred_location ? ` · ${c.preferred_location}` : ""}
                      {c.preferred_timeline ? ` · ${c.preferred_timeline}` : ""}
                    </p>
                    {invoiceFor(c.id) && (
                      <p className="mt-1 text-xs">
                        <Link
                          href={`/dashboard/admin/invoices/${invoiceFor(c.id)!.id}`}
                          className="font-semibold text-[var(--color-brand-dark)] underline"
                        >
                          Invoice {invoiceFor(c.id)!.reference} →
                        </Link>
                      </p>
                    )}
                    <div className="mt-3">
                      <CampaignChecklist
                        facts={{
                          status: c.status,
                          paymentWaived: !!c.payment_waived_at,
                          orderForm: orderFormFor(c.id) ?? null,
                          invoice: invoiceFor(c.id) ?? null,
                          events: suggestionsFor(c.id),
                          surveyPublished: publishedSurvey.has(c.id),
                          opensAt: c.opens_at,
                        }}
                      />
                    </div>
                    {(c.status === "completed" || c.status === "closed") && finishedRecord.get(c.id) && (
                      <p className="mt-2 rounded-lg bg-[var(--color-mist)] px-3 py-2 text-xs text-[var(--color-ink)]">
                        <span className="font-semibold">
                          {c.status === "closed" ? "Closed" : "Completed"} {formatDate(finishedRecord.get(c.id)!.created_at)}
                          {c.status === "closed" && finishedRecord.get(c.id)!.reason
                            ? ` — ${closeReasonLabel(finishedRecord.get(c.id)!.reason)}`
                            : ""}
                        </span>
                        {finishedRecord.get(c.id)!.note ? `: ${finishedRecord.get(c.id)!.note}` : ""}
                        <span className="text-[var(--color-ink-soft)]"> (admins only)</span>
                      </p>
                    )}
                    {c.payment_waived_at && (
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        <span className="font-semibold">Payment waived</span>{" "}
                        {formatDate(c.payment_waived_at)}: {c.payment_waived_reason}
                      </p>
                    )}
                    {c.reward_rules && (
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        <span className="font-semibold">Reward:</span>{" "}
                        {c.reward_rules}
                      </p>
                    )}
                    {/* The sponsor already has something in mind — worth
                        seeing before picking listings to suggest back. */}
                    {(c.suggested_event_note || c.suggested_event_url) && (
                      <p className="mt-2 rounded-lg bg-[var(--color-gold)]/40 px-3 py-2 text-xs text-[var(--color-ink)]">
                        <span className="font-semibold">
                          Sponsor suggests:
                        </span>{" "}
                        {c.suggested_event_note}
                        {c.suggested_event_url && (
                          <>
                            {" "}
                            <a
                              href={c.suggested_event_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold text-[var(--color-brand-dark)] underline"
                            >
                              Open link ↗
                            </a>
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Link
                      href={`/dashboard/admin/campaigns/${c.id}`}
                      className="btn btn-primary text-sm"
                    >
                      Open campaign
                    </Link>
                    {c.brands && (
                      <Link
                        href={`/dashboard/messages/with/${c.brands.profile_id}?subject=${encodeURIComponent(`Campaign ${c.reference}`)}`}
                        className="btn btn-ghost text-sm"
                      >
                        Message brand
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/admin/campaigns/${c.id}/order-form`}
                      className="btn btn-ghost text-sm"
                    >
                      {orderFormFor(c.id)
                        ? `Order form · ${ORDER_FORM_STATUS_LABELS[orderFormFor(c.id)!.status as OrderFormStatus]}`
                        : "Create order form"}
                    </Link>
                    {c.status === "awaiting_payment" && (
                      <details className="w-64 text-left">
                        <summary className="btn btn-ghost cursor-pointer text-sm">
                          Waive payment…
                        </summary>
                        <form
                          action={waiveCampaignPayment}
                          className="mt-2 space-y-2 rounded-xl border border-black/10 p-3"
                        >
                          <input type="hidden" name="campaign_id" value={c.id} />
                          <p className="text-xs text-[var(--color-ink-soft)]">
                            Opens this campaign to artists without payment and
                            cancels its invoice. Recorded against your name.
                          </p>
                          <textarea
                            name="reason"
                            required
                            rows={2}
                            className="textarea text-sm"
                            placeholder="Why is payment being waived?"
                          />
                          <ConfirmSubmitButton
                            label="Open campaign…"
                            className="btn btn-primary w-full text-sm"
                            title={`Waive payment for ${c.reference}?`}
                            warnings={["You're overriding the payment gate — the campaign opens without being paid."]}
                            points={[
                              `Change ${c.reference} from Awaiting payment to Needs matching, open to artists on Discover campaigns.`,
                              invoiceFor(c.id)
                                ? `Cancel invoice ${invoiceFor(c.id)!.reference}${invoiceFor(c.id)!.status === "draft" ? "" : " and void it in Stripe"}.`
                                : "There's no invoice to cancel.",
                              "Record your reason against your name, and tell the brand their campaign is open.",
                            ]}
                            confirmLabel="Yes, waive payment"
                          />
                        </form>
                      </details>
                    )}
                    {!invoiceFor(c.id) && (
                      <form action={draftInvoiceForCampaign}>
                        <input type="hidden" name="campaign_id" value={c.id} />
                        <button type="submit" className="btn btn-ghost text-sm">
                          Draft invoice
                        </button>
                      </form>
                    )}
                    <CampaignStatusActions
                      campaignId={c.id}
                      reference={c.reference}
                      status={c.status}
                      stage={stageOf.get(c.id)!}
                      openProposals={suggestionsFor(c.id).filter((s) => s.status === "in_progress").length}
                      settledEvent={
                        suggestionsFor(c.id).find((s) => s.status === "confirmed" || s.status === "completed") ?? null
                      }
                      invoice={invoiceFor(c.id) ?? null}
                      surveyPublished={publishedSurvey.has(c.id)}
                      reopenTo={
                        finishedRecord.get(c.id)?.to_status === c.status
                          ? finishedRecord.get(c.id)!.from_status === "awaiting_payment"
                            ? "awaiting_payment"
                            : "in_progress"
                          : null
                      }
                      returnTo="/dashboard/admin/campaigns"
                    />
                  </div>
                </div>

                {/* Which events were put forward, and which one won. Editing
                    an accepted event goes through the admin event page, where
                    the change is confirmed before it saves. */}
                {suggestionsFor(c.id).length > 0 && (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <p className="field-label">
                      Suggested events ({suggestionsFor(c.id).length})
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {suggestionsFor(c.id).map((s) => {
                        const accepted =
                          s.status === "confirmed" || s.status === "completed";
                        return (
                          <Link
                            key={s.id}
                            href={`/dashboard/admin/events/sponsored/${s.id}`}
                            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition hover:bg-[var(--color-mist)] ${
                              accepted
                                ? "border-[var(--color-olive-deep)]/30 bg-[var(--color-sage)]/50"
                                : "border-black/10"
                            }`}
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              {accepted && (
                                <span aria-hidden className="text-[var(--color-olive-deep)]">
                                  ✓
                                </span>
                              )}
                              <span
                                className={
                                  accepted
                                    ? "font-semibold text-[var(--color-ink)]"
                                    : "text-[var(--color-ink)]"
                                }
                              >
                                {s.name}
                              </span>
                              <StatusBadge status={s.status} />
                              {accepted && (
                                <span className="text-xs font-semibold text-[var(--color-olive-deep)]">
                                  selected by the sponsor
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-[var(--color-ink-soft)]">
                              {s.event_date ? formatDate(s.event_date) : "No date"}
                              {" · "}Brand {s.brand_agreed ? "✓" : "…"} · Artist{" "}
                              {s.artist_agreed ? "✓" : "…"} · Edit →
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Open for more suggestions only while nothing has settled.
                    Gating on the campaign's own status wasn't enough — a
                    campaign could sit at "in progress" while already carrying
                    a confirmed or completed sponsorship, and suggesting more
                    against it creates a conflict nobody can accept (0022). */}
                {c.status === "in_progress" && !isSettled(c.id) ? (
                  <div className="mt-4 border-t border-black/10 pt-4">
                    <MatchForm campaignId={c.id} listings={listings} />
                  </div>
                ) : c.status === "awaiting_payment" ? (
                  <p className="mt-4 border-t border-black/10 pt-4 text-sm text-[var(--color-ink-soft)]">
                    Awaiting payment — hidden from artists and can&apos;t be
                    matched until its invoice is marked paid or payment is
                    waived.
                  </p>
                ) : (
                  isSettled(c.id) && (
                    <p className="mt-4 border-t border-black/10 pt-4 text-sm text-[var(--color-ink-soft)]">
                      This campaign is settled — no further events can be
                      suggested against it.
                    </p>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <CampaignStatusLegend />
    </div>
  );
}
