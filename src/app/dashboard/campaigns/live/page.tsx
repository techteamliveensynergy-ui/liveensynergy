import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import type { Campaign, Invoice } from "@/lib/types";
import {
  formatGbp,
  invoiceDisplayStatus,
  isBillingComplete,
  type BillingFields,
} from "@/lib/billing";
import { ORDER_FORM_STATUS_LABELS, type OrderFormStatus } from "@/lib/order-forms";
import { CampaignProgress, type CampaignEventRow } from "@/components/campaigns/CampaignProgress";
import { CampaignStageBadge } from "@/components/campaigns/CampaignStageBadge";
import { campaignStage } from "@/lib/campaign-stage";
import { campaignTitle } from "@/lib/campaign-requests";
import { CAMPAIGN_COLUMNS } from "@/lib/campaign-columns";

export const metadata = { title: "Campaigns live" };

type InvoiceRow = Invoice & { campaigns: { reference: string } | null };

/**
 * A brand's campaigns once the team has turned a request into one (13 Oct
 * client notes split the old single Campaigns page into Campaign requests and
 * Campaigns live). Order forms, billing and invoices live here too — they only
 * exist once there's a campaign. Each campaign shows where it is as a
 * checklist (campaignSteps()) instead of just a status and a Contact button.
 *
 * Each campaign is one boxed section with its own order form and invoices
 * inside it (client feedback, 13 Oct: details and order form of the same
 * campaign should read as one group). Invoices not tied to a campaign are
 * listed after.
 */
export default async function CampaignsLivePage() {
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase
    .from("brands")
    .select(
      "id, billing_legal_name, billing_email, billing_address_line1, billing_city, billing_postcode, billing_country",
    )
    .eq("profile_id", profile.id)
    .maybeSingle<{ id: string } & Partial<BillingFields>>();

  const [{ data: campaignData }, { data: invoiceData }, { data: orderFormData }] = brand
    ? await Promise.all([
        supabase
          .from("campaigns")
          .select(CAMPAIGN_COLUMNS)
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false })
          .overrideTypes<Campaign[], { merge: false }>(),
        // Drafts are an admin's working copy — a brand only ever sees an
        // invoice once it has been sent. (RLS enforces this too, since 0047.)
        supabase
          .from("invoices")
          .select("*, campaigns(reference)")
          .eq("brand_id", brand.id)
          .neq("status", "draft")
          .order("created_at", { ascending: false }),
        // Order forms the team has sent (RLS hides drafts) — 0054.
        supabase
          .from("campaign_order_forms")
          .select("id, campaign_id, reference, status, campaign_name, total_gbp, sent_at, approved_at, campaigns(reference)")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const orderForms = (orderFormData ?? []) as unknown as {
    id: string;
    campaign_id: string;
    reference: string;
    status: OrderFormStatus;
    campaign_name: string | null;
    total_gbp: number | null;
    sent_at: string | null;
    approved_at: string | null;
    campaigns: { reference: string } | null;
  }[];

  const campaigns = (campaignData ?? []) as Campaign[];
  const invoices = (invoiceData ?? []) as InvoiceRow[];
  // A campaign means an invoice is coming; it can't be sent without these.
  const needsBilling =
    !!brand && campaigns.length > 0 && !isBillingComplete(brand);

  // Progress facts for each campaign's checklist: its sponsored events (the
  // brand is a party, so RLS returns them at any status) and whether any of
  // its surveys is published — via campaign_party_surveys(), since a brand
  // has no read policy on survey_templates (0060).
  const campaignIds = campaigns.map((c) => c.id);
  const [{ data: eventData }, surveyResults] = await Promise.all([
    campaignIds.length > 0
      ? supabase
          .from("sponsored_events")
          .select("id, name, campaign_id, status, reward_codes_confirmed_at")
          .in("campaign_id", campaignIds)
      : Promise.resolve({ data: [] }),
    Promise.all(
      campaigns
        .filter((c) => c.status !== "awaiting_payment")
        .map(async (c) => {
          const { data } = await supabase.rpc("campaign_party_surveys", { p_campaign_id: c.id });
          return [c.id, ((data ?? []) as { status: string }[]).some((s) => s.status === "published")] as const;
        }),
    ),
  ]);
  const events = (eventData ?? []) as CampaignEventRow[];
  const surveyPublished = new Map(surveyResults);

  return (
    <div>
      <PageHeader
        title="Campaigns live"
        subtitle="Your campaigns once our team has set them up — what's happening now, order forms and invoices."
        action={
          <Link href="/dashboard/campaigns/new" className="btn btn-primary">
            + New request
          </Link>
        }
      />

      {/* An order form waiting on the brand is the one thing here that blocks
          progress, so it's flagged up top as well as inside its campaign. */}
      {orderForms
        .filter((f) => f.status === "sent")
        .map((f) => (
          <Link
            key={f.id}
            href={`/order-forms/${f.id}`}
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--color-brand)] px-5 py-4 text-white"
          >
            <span className="font-semibold">
              Your order form for {f.campaign_name ?? f.campaigns?.reference ?? "your campaign"} is ready to review
            </span>
            <span className="btn btn-white text-sm">Review &amp; approve →</span>
          </Link>
        ))}

      {needsBilling && (
        <div className="mb-6 rounded-2xl bg-[var(--color-gold)]/40 px-5 py-4 text-sm text-[var(--color-ink)]">
          <p className="font-semibold">Add your billing details</p>
          <p className="mt-1">
            When we invoice you we&apos;ll need your company&apos;s legal name,
            billing email and address. Adding them now means your invoice can
            go out without delay.{" "}
            <Link
              href="/dashboard/profile"
              className="font-semibold text-[var(--color-brand-dark)] underline"
            >
              Add them in your profile
            </Link>
            .
          </p>
        </div>
      )}

      <h2 className="mb-3 font-display text-lg font-semibold">Your campaigns</h2>
      {campaigns.length === 0 ? (
        <EmptyState
          icon="📣"
          title="No live campaigns yet"
          body="Once our team turns one of your requests into a campaign, it appears here with its order form, invoice and progress."
          cta={{ href: "/dashboard/campaigns", label: "See your requests" }}
        />
      ) : (
        <div className="space-y-6">
          {campaigns.map((c) => {
            const mine = events.filter((e) => e.campaign_id === c.id);
            const forms = orderForms.filter((f) => f.campaign_id === c.id);
            const bills = invoices.filter((i) => i.campaign_id === c.id);
            return (
              <section
                key={c.id}
                id={`campaign-${c.id}`}
                aria-labelledby={`campaign-title-${c.id}`}
                className="card scroll-mt-24 overflow-hidden p-0 target:ring-2 target:ring-[var(--color-brand)]"
              >
                {/* Header: which campaign this group is about. */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 bg-[var(--color-mist)] px-5 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 id={`campaign-title-${c.id}`} className="font-display text-lg font-semibold">
                        <Link href={`/dashboard/campaigns/live/${c.id}`} className="hover:underline">
                          {campaignTitle(c, "Sponsorship campaign")}
                        </Link>
                      </h3>
                      <CampaignStageBadge
                        stage={campaignStage({
                          status: c.status,
                          settled: mine.find((e) => e.status === "confirmed" || e.status === "completed") ?? null,
                          openProposals: mine.filter((e) => e.status === "in_progress").length,
                          surveyPublished: surveyPublished.get(c.id) ?? false,
                          opensAt: c.opens_at,
                        })}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                      Ref {c.reference} · Budget £{Number(c.budget_gbp).toLocaleString("en-GB")}
                    </p>
                  </div>
                  <Link href={`/dashboard/campaigns/live/${c.id}`} className="btn btn-ghost bg-white text-sm">
                    View campaign
                  </Link>
                </div>

                <div className="divide-y divide-black/10">
                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                      Campaign details
                    </p>
                    <p className="mt-1 line-clamp-3 text-sm text-[var(--color-ink)]">{c.description}</p>
                  </div>

                  <div className="px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                      Order form &amp; invoice
                    </p>
                    {forms.length === 0 && bills.length === 0 ? (
                      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
                        Our team will send your order form here to approve; the invoice follows.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {forms.map((f) => (
                          <li key={f.id}>
                            <Link
                              href={`/order-forms/${f.id}`}
                              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm transition ${
                                f.status === "sent"
                                  ? "bg-[var(--color-brand)] text-white"
                                  : "bg-[var(--color-mist)] hover:bg-[var(--color-mist)]/70"
                              }`}
                            >
                              <span>
                                <span className="font-semibold">Order form {f.reference}</span>
                                {f.total_gbp != null ? ` · ${formatGbp(f.total_gbp)} incl. VAT` : ""}
                              </span>
                              <span className={f.status === "sent" ? "font-semibold" : "chip"}>
                                {f.status === "sent" ? "Review & approve →" : ORDER_FORM_STATUS_LABELS[f.status]}
                              </span>
                            </Link>
                          </li>
                        ))}
                        {bills.map((inv) => (
                          <li key={inv.id}>
                            <Link
                              href={`/dashboard/campaigns/invoices/${inv.id}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm transition hover:bg-[var(--color-mist)]/70"
                            >
                              <span>
                                <span className="font-semibold">Invoice {inv.reference}</span> · {formatGbp(inv.amount_gbp)}
                                {inv.vat_gbp != null ? " inc. VAT" : ""}
                                {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}
                              </span>
                              <StatusBadge status={invoiceDisplayStatus(inv)} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="px-5 py-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                      Progress
                    </p>
                    <CampaignProgress
                      campaign={c}
                      events={mine}
                      surveyPublished={surveyPublished.get(c.id) ?? false}
                      invoice={bills.find((i) => i.status === "sent" || i.status === "overdue")}
                    />
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Invoices not tied to one of the campaigns above (e.g. a one-off). */}
      {invoices.some((i) => !campaigns.some((c) => c.id === i.campaign_id)) && (
        <>
          <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Other invoices</h2>
          <div className="space-y-2">
            {invoices
              .filter((i) => !campaigns.some((c) => c.id === i.campaign_id))
              .map((inv) => (
                <Link
                  key={inv.id}
                  href={`/dashboard/campaigns/invoices/${inv.id}`}
                  className="card flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-[var(--color-mist)]"
                >
                  <div>
                    <p className="text-sm font-semibold">{inv.reference}</p>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      {formatGbp(inv.amount_gbp)}
                      {inv.vat_gbp != null ? " inc. VAT" : ""}
                      {inv.due_date ? ` · due ${formatDate(inv.due_date)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={invoiceDisplayStatus(inv)} />
                </Link>
              ))}
          </div>
        </>
      )}

      {invoices.length > 0 && (
        <p className="mt-6 text-xs text-[var(--color-ink-soft)]">
          Open an invoice to pay it — online by card or bank transfer through our secure payment page
          (Stripe), or by bank transfer quoting the invoice reference. Card details never touch
          Live·En·Synergy.
        </p>
      )}
    </div>
  );
}

