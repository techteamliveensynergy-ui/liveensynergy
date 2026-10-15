import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/dashboard/ui";
import { formatDate } from "@/lib/format";
import { formatGbp, invoiceDisplayStatus } from "@/lib/billing";
import { campaignTitle, requestCategoryLabel } from "@/lib/campaign-requests";
import { ORDER_FORM_STATUS_LABELS, type OrderFormStatus } from "@/lib/order-forms";
import { CampaignProgress, type CampaignEventRow } from "@/components/campaigns/CampaignProgress";
import { CampaignStageBadge } from "@/components/campaigns/CampaignStageBadge";
import { campaignStage } from "@/lib/campaign-stage";
import { DetailFact as Fact } from "@/components/campaigns/DetailFact";
import type { LiveCampaignSurvey } from "@/components/campaigns/LiveCampaignPanel";
import type { Campaign, Invoice } from "@/lib/types";

export const metadata = { title: "Campaign" };

type EventRow = CampaignEventRow & { reference: string; event_date: string | null };

interface OrderFormRow {
  id: string;
  reference: string;
  status: OrderFormStatus;
  total_gbp: number | null;
}

const SURVEY_KIND: Record<string, string> = {
  pre_event: "Pre-event survey",
  post_event: "Post-event survey",
};

/**
 * One of a brand's live campaigns (client feedback, 13 Oct: "should be able
 * to click into the campaigns to view them"). Gathers everything the brand
 * may see about it in one place: the next-step checklist, its order form and
 * invoices, the sponsored events it produced, its surveys (results are the
 * brand's aggregated view — brand_survey_results(), 0060) and the details it
 * was set up with. Read-only: campaigns are admin-update-only under RLS, so
 * changes go through the team.
 */
export default async function BrandCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { profile } = await requireRole(["brand"]);
  const supabase = await createClient();

  const { data: brand } = await supabase.from("brands").select("id").eq("profile_id", profile.id).maybeSingle();
  // Scoped by brand as well as by RLS, so another brand's id is a plain 404.
  const { data } = brand
    ? await supabase.from("campaigns").select("*").eq("id", id).eq("brand_id", brand.id).maybeSingle()
    : { data: null };
  if (!data) notFound();
  const c = data as Campaign;

  const [{ data: eventData }, { data: invoiceData }, { data: orderFormData }, { data: requestData }, { data: surveyData }] =
    await Promise.all([
      supabase
        .from("sponsored_events")
        .select("id, name, reference, campaign_id, status, event_date, reward_codes_confirmed_at")
        .eq("campaign_id", c.id)
        .order("created_at", { ascending: true }),
      // A brand never sees a draft invoice (RLS since 0047; filtered here too).
      supabase
        .from("invoices")
        .select("*")
        .eq("campaign_id", c.id)
        .neq("status", "draft")
        .order("created_at", { ascending: false }),
      supabase
        .from("campaign_order_forms")
        .select("id, reference, status, total_gbp")
        .eq("campaign_id", c.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("campaign_intake_requests")
        .select("id, reference")
        .eq("converted_campaign_id", c.id)
        .limit(1)
        .maybeSingle<{ id: string; reference: string }>(),
      // No survey can be live before payment opens the campaign.
      c.status === "awaiting_payment"
        ? Promise.resolve({ data: [] })
        : supabase.rpc("campaign_party_surveys", { p_campaign_id: c.id }),
    ]);

  const events = (eventData ?? []) as EventRow[];
  const invoices = (invoiceData ?? []) as Invoice[];
  const orderForms = (orderFormData ?? []) as OrderFormRow[];
  const surveys = (surveyData ?? []) as LiveCampaignSurvey[];
  const request = requestData;
  const openInvoice = invoices.find((i) => i.status === "sent" || i.status === "overdue");
  // Withdrawn proposals are history, not something the brand needs to act on.
  const visibleEvents = events.filter((e) => e.status !== "withdrawn");

  const title = campaignTitle(c, "Sponsorship campaign");

  return (
    <div className="space-y-6">
      <Link href="/dashboard/campaigns/live" className="btn btn-ghost text-sm">
        ← Back to Campaigns live
      </Link>

      <section className="card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">{title}</h1>
          <CampaignStageBadge
            stage={campaignStage({
              status: c.status,
              settled: events.find((e) => e.status === "confirmed" || e.status === "completed") ?? null,
              openProposals: events.filter((e) => e.status === "in_progress").length,
              surveyPublished: surveys.some((s) => s.status === "published"),
              opensAt: c.opens_at,
            })}
          />
        </div>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Ref {c.reference} · Set up {formatDate(c.created_at)}
          {request && (
            <>
              {" · From request "}
              <Link
                href={`/dashboard/campaigns/requests/${request.id}`}
                className="font-semibold text-[var(--color-brand-dark)] underline"
              >
                {request.reference}
              </Link>
            </>
          )}
        </p>

        <div className="mt-4">
          <CampaignProgress
            campaign={c}
            events={events}
            surveyPublished={surveys.some((s) => s.status === "published")}
            invoice={openInvoice}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold">Order form &amp; invoices</h2>
          {orderForms.length === 0 && invoices.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Our team will send your order form here to approve; the invoice follows once it&apos;s approved.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {orderForms.map((f) => (
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
              {invoices.map((inv) => (
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
          {c.payment_waived_at && (
            <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
              Payment for this campaign was arranged with our team on {formatDate(c.payment_waived_at)}.
            </p>
          )}
        </section>

        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold">Events</h2>
          {visibleEvents.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {c.status === "awaiting_payment"
                ? "Once the campaign is paid, our team matches it with a fitting artist or event — it will appear here."
                : "Our team is lining up a fitting artist or event — proposals will appear here."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {visibleEvents.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/sponsored/${e.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm transition hover:bg-[var(--color-mist)]/70"
                  >
                    <span>
                      <span className="font-semibold">{e.name}</span>
                      <span className="text-[var(--color-ink-soft)]">
                        {" "}
                        · {e.reference}
                        {e.event_date ? ` · ${formatDate(e.event_date)}` : ""}
                      </span>
                    </span>
                    <StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Surveys</h2>
          {surveys.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              The campaign survey appears here once our team publishes it, with its results as responses come in.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {surveys.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-3 text-sm"
                >
                  <span>
                    <span className="font-semibold">{s.title}</span>
                    <span className="text-[var(--color-ink-soft)]">
                      {" "}
                      · {SURVEY_KIND[s.kind] ?? "Survey"} · {s.status === "published" ? "open" : "closed"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {s.status === "published" && s.is_public && (
                      <Link href={`/survey/${s.id}`} target="_blank" className="btn btn-ghost text-xs">
                        Open survey ↗
                      </Link>
                    )}
                    <Link href={`/dashboard/survey-results/${s.id}`} className="btn btn-ghost text-xs">
                      View results
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold">Campaign details</h2>
        {c.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.image_url} alt="" className="mt-4 max-h-64 w-full rounded-xl object-cover" />
        )}
        <dl className="mt-4 grid gap-5 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Fact label="Campaign description" value={c.description} />
          </div>
          <Fact label="Budget" value={`£${Number(c.budget_gbp).toLocaleString("en-GB")}`} />
          <Fact
            label="Participants in your package"
            value={c.package_participant_count ? c.package_participant_count.toLocaleString("en-GB") : null}
          />
          <Fact label="Category" value={requestCategoryLabel(c)} />
          <Fact label="Location" value={c.preferred_location} />
          <Fact label="Timeline" value={c.preferred_timeline} />
          <Fact label="Artist / event in mind" value={c.target_name} />
          <Fact label="Reward rules" value={c.reward_rules} />
          <Fact label="Expected outcomes" value={c.expected_outcomes} />
          <Fact label="Anything else" value={c.additional_info} />
          <Fact
            label="Event you suggested"
            value={
              c.suggested_event_note || c.suggested_event_url ? (
                <>
                  {c.suggested_event_note}
                  {c.suggested_event_url && (
                    <>
                      {c.suggested_event_note ? " " : ""}
                      <a href={c.suggested_event_url} target="_blank" rel="noopener noreferrer" className="underline">
                        {c.suggested_event_url}
                      </a>
                    </>
                  )}
                </>
              ) : null
            }
          />
          <Fact
            label="Campaign manager"
            value={[c.manager_name, c.manager_email, c.manager_phone].filter(Boolean).join(" · ") || null}
          />
        </dl>
        <p className="mt-5 text-xs text-[var(--color-ink-soft)]">
          Need to change something?{" "}
          <Link href="/dashboard/messages?tab=support" className="underline">
            Message the Live·En·Synergy team
          </Link>
        </p>
      </section>
    </div>
  );
}
