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

export const metadata = { title: "Campaigns live" };

type InvoiceRow = Invoice & { campaigns: { reference: string } | null };

/**
 * A brand's campaigns once the team has turned a request into one (13 Oct
 * client notes split the old single Campaigns page into Campaign requests and
 * Campaigns live). Order forms, billing and invoices live here too — they only
 * exist once there's a campaign. Each campaign shows where it is as a
 * checklist (campaignSteps()) instead of just a status and a Contact button.
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
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
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
          .select("id, reference, status, campaign_name, total_gbp, sent_at, approved_at, campaigns(reference)")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const orderForms = (orderFormData ?? []) as unknown as {
    id: string;
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

      {orderForms.length > 0 && (
        <section className="mb-6 space-y-3">
          {orderForms.map((f) => (
            <Link
              key={f.id}
              href={`/order-forms/${f.id}`}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4 ${
                f.status === "sent"
                  ? "bg-[var(--color-brand)] text-white"
                  : "card"
              }`}
            >
              <div>
                <p className="font-semibold">
                  {f.status === "sent" ? "Your order form is ready to review — " : "Order form "}
                  {f.reference}
                </p>
                <p className={`text-sm ${f.status === "sent" ? "text-white/85" : "text-[var(--color-ink-soft)]"}`}>
                  {f.campaign_name ?? "Campaign"} · {f.campaigns?.reference ?? ""}
                  {f.total_gbp != null ? ` · ${formatGbp(f.total_gbp)} incl. VAT` : ""}
                </p>
              </div>
              <span className={f.status === "sent" ? "btn btn-white text-sm" : "chip"}>
                {f.status === "sent" ? "Review & approve →" : ORDER_FORM_STATUS_LABELS[f.status]}
              </span>
            </Link>
          ))}
        </section>
      )}

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

      <h2 className="mb-3 font-display text-lg font-semibold">
        Your campaigns
      </h2>
      {campaigns.length === 0 ? (
        <EmptyState
          icon="📣"
          title="No live campaigns yet"
          body="Once our team turns one of your requests into a campaign, it appears here with its order form, invoice and progress."
          cta={{ href: "/dashboard/campaigns", label: "See your requests" }}
        />
      ) : (
        <>
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                id={`campaign-${c.id}`}
                className="card flex scroll-mt-24 flex-wrap items-center justify-between gap-4 p-5 target:ring-2 target:ring-[var(--color-brand)]"
              >
                <div className="max-w-xl">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">
                      {c.target_name || c.category || "Sponsorship campaign"}
                    </h3>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
                    {c.description}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    Ref {c.reference} · Budget £
                    {Number(c.budget_gbp).toLocaleString("en-GB")}
                  </p>
                </div>
                <div className="w-full">
                  <CampaignProgress
                    campaign={c}
                    events={events.filter((e) => e.campaign_id === c.id)}
                    surveyPublished={surveyPublished.get(c.id) ?? false}
                    invoice={invoices.find(
                      (i) => i.campaign_id === c.id && (i.status === "sent" || i.status === "overdue"),
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {invoices.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-display text-lg font-semibold">
            Your orders
          </h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            Payment is by bank transfer against the invoice reference below —
            no card details are collected on the platform.
          </p>
          <div className="space-y-2">
            {invoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/dashboard/campaigns/invoices/${inv.id}`}
                className="card flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-[var(--color-mist)]"
              >
                <div>
                  <p className="text-sm font-semibold">{inv.reference}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {inv.campaigns?.reference ?? "—"} · {formatGbp(inv.amount_gbp)}
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
    </div>
  );
}

