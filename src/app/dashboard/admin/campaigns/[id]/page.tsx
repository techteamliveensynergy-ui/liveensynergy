import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/dashboard/ui";
import { LiveCampaignPanel, type LiveCampaignSurvey } from "@/components/campaigns/LiveCampaignPanel";
import { formatDate } from "@/lib/format";
import { invoiceDisplayStatus } from "@/lib/billing";
import { ORDER_FORM_STATUS_LABELS, type OrderFormStatus } from "@/lib/order-forms";
import type { Campaign } from "@/lib/types";

export const metadata = { title: "Campaign · Admin" };

interface CampaignRow extends Campaign {
  brands: { brand_name: string; profile_id: string } | null;
  campaign_packages: { name: string } | null;
}

interface SponsorshipRow {
  id: string;
  reference: string;
  name: string;
  status: string;
  event_date: string | null;
  artist_display_name: string | null;
  reward_codes_confirmed_at: string | null;
  brand_agreed: boolean;
  artist_agreed: boolean;
}

const money = (n: number | null | undefined) =>
  n == null ? "—" : `£${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

/**
 * One campaign, everything about it on one screen (Admin Portal brief, 9 Oct:
 * "Live Campaign" — clicking a campaign should open its details, with the
 * order form, survey links, participant numbers, code status, responses,
 * analysis and check-in in one place). Read-only; "Edit" is a secondary
 * action, since the content came from the brand's own request.
 */
export default async function AdminCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: campaign }, { data: orderForm }, { data: invoice }, { data: sponsorshipRows }, { data: templateRows }, { data: intake }] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("*, brands(brand_name, profile_id), campaign_packages(name)")
        .eq("id", id)
        .maybeSingle<CampaignRow>(),
      supabase
        .from("campaign_order_forms")
        .select("id, reference, status")
        .eq("campaign_id", id)
        .maybeSingle<{ id: string; reference: string; status: OrderFormStatus }>(),
      supabase
        .from("invoices")
        .select("id, reference, status, due_date")
        .eq("campaign_id", id)
        .eq("kind", "campaign_package")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; reference: string; status: string; due_date: string | null }>(),
      supabase
        .from("sponsored_events")
        .select("id, reference, name, status, event_date, artist_display_name, reward_codes_confirmed_at, brand_agreed, artist_agreed")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("survey_templates")
        .select("id, kind, title, status, is_public, published_at")
        .eq("campaign_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("campaign_intake_requests")
        .select("id, reference")
        .eq("converted_campaign_id", id)
        .maybeSingle<{ id: string; reference: string }>(),
    ]);
  if (!campaign) notFound();

  const sponsorships = (sponsorshipRows ?? []) as SponsorshipRow[];
  // The live deal: the confirmed/completed sponsorship (at most one, 0022's
  // unique index); otherwise nothing is running yet.
  const live = sponsorships.find((s) => s.status === "confirmed" || s.status === "completed") ?? null;

  const templates = (templateRows ?? []) as (LiveCampaignSurvey & { published_at: string | null })[];
  const shownTemplates = templates.filter((t) => t.status === "published" || t.status === "archived");

  const [{ data: partRows }, { count: completionCount }, { count: tierCount }, { data: codeRows }, { data: statRows }] =
    await Promise.all([
      live
        ? supabase.from("participations").select("status").eq("sponsored_event_id", live.id)
        : Promise.resolve({ data: [] as { status: string }[] }),
      live
        ? supabase
            .from("sponsored_event_survey_completions")
            .select("participation_id", { count: "exact", head: true })
            .eq("sponsored_event_id", live.id)
        : Promise.resolve({ count: 0 }),
      live
        ? supabase.from("sponsored_event_reward_tiers").select("id", { count: "exact", head: true }).eq("sponsored_event_id", live.id)
        : Promise.resolve({ count: 0 }),
      live
        ? supabase.from("reward_codes").select("status").eq("sponsored_event_id", live.id)
        : Promise.resolve({ data: [] as { status: string }[] }),
      shownTemplates.length
        ? supabase
            .from("survey_template_stats")
            .select("template_id, pending_count, pass_count, review_count")
            .in("template_id", shownTemplates.map((t) => t.id))
        : Promise.resolve({ data: [] }),
    ]);

  const parts = (partRows ?? []) as { status: string }[];
  const codes = (codeRows ?? []) as { status: string }[];
  const counted = new Map(
    ((statRows ?? []) as { template_id: string; pending_count: number; pass_count: number; review_count: number }[]).map(
      (r) => [r.template_id, r.pending_count + r.pass_count + r.review_count],
    ),
  );
  const brand = campaign.brands;
  const title = campaign.target_name || `${brand?.brand_name ?? "Brand"} campaign`;
  const messageHref = brand
    ? `/dashboard/messages/with/${brand.profile_id}?subject=${encodeURIComponent(`Campaign ${campaign.reference}`)}`
    : null;

  return (
    <div className="space-y-6">
      <Link href="/dashboard/admin/campaigns" className="inline-block text-sm text-[var(--color-brand)]">
        ← Back to campaigns
      </Link>
      <PageHeader
        title={title}
        subtitle={`${campaign.reference} · ${brand?.brand_name ?? "Unknown brand"}${campaign.campaign_packages ? ` · ${campaign.campaign_packages.name}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={campaign.status} />
            {messageHref && (
              <Link href={messageHref} className="btn btn-primary text-sm">
                Message brand
              </Link>
            )}
            <Link href={`/dashboard/admin/campaigns/${id}/edit`} className="btn btn-ghost text-sm">
              Edit
            </Link>
          </div>
        }
      />

      <section className="card p-6">
        <p className="whitespace-pre-line text-[var(--color-ink)]">{campaign.description}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Budget (gross)</dt>
            <dd className="font-semibold">{money(campaign.budget_gbp)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Timeline</dt>
            <dd>{campaign.preferred_timeline || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Location</dt>
            <dd>{campaign.preferred_location || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Invoice</dt>
            <dd>
              {invoice ? (
                <Link href={`/dashboard/admin/invoices/${invoice.id}`} className="underline">
                  {invoice.reference} · {invoiceDisplayStatus(invoice)}
                </Link>
              ) : campaign.payment_waived_at ? (
                "Payment waived"
              ) : (
                "None yet"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Brand contact</dt>
            <dd>
              {campaign.manager_name || "—"}
              {campaign.manager_email ? ` · ${campaign.manager_email}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Brand account</dt>
            <dd>
              {brand ? (
                <Link href={`/dashboard/admin/users/${brand.profile_id}`} className="underline">
                  {brand.brand_name}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Came from</dt>
            <dd>
              {intake ? (
                <Link href={`/dashboard/admin/campaigns/intake/${intake.id}`} className="underline">
                  Request {intake.reference}
                </Link>
              ) : (
                "Created by admin"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-ink-soft)]">Created</dt>
            <dd>{formatDate(campaign.created_at)}</dd>
          </div>
        </dl>
      </section>

      <LiveCampaignPanel
        viewer="admin"
        siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
        orderForm={
          orderForm
            ? {
                href: `/dashboard/admin/campaigns/${id}/order-form`,
                label: `Order form ${orderForm.reference}`,
                note: ORDER_FORM_STATUS_LABELS[orderForm.status],
              }
            : { href: `/dashboard/admin/campaigns/${id}/order-form`, label: "Create order form" }
        }
        surveys={shownTemplates.map((t) => ({
          ...t,
          responses: counted.get(t.id) ?? 0,
          resultsHref: `/dashboard/admin/surveys/${t.id}/results`,
        }))}
        participants={{
          total: parts.length,
          verified: parts.filter((p) => p.status === "attendance_verified" || p.status === "reward_released").length,
          surveysCompleted: completionCount ?? 0,
        }}
        codes={
          live
            ? {
                issued: codes.filter((c) => c.status !== "void").length,
                redeemed: codes.filter((c) => c.status === "redeemed").length,
                tiers: tierCount ?? 0,
                consented: !!live.reward_codes_confirmed_at,
              }
            : null
        }
        checkIn={live ? { href: `/dashboard/admin/events/sponsored/${live.id}`, note: "QR and participant check-ins on the event page" } : null}
        adminLinks={live ? [{ href: `/dashboard/admin/events/sponsored/${live.id}`, label: "Who received which code →" }] : []}
      />

      {templates.some((t) => t.status === "draft") && (
        <p className="text-sm text-[var(--color-ink-soft)]">
          Draft surveys for this campaign:{" "}
          {templates
            .filter((t) => t.status === "draft")
            .map((t, i) => (
              <span key={t.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/dashboard/admin/surveys/${t.id}`} className="underline">
                  {t.title}
                </Link>
              </span>
            ))}
        </p>
      )}

      <section className="card p-6">
        <h2 className="text-lg font-semibold">Events and sponsorships</h2>
        {sponsorships.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            No event suggested yet.{" "}
            <Link href="/dashboard/admin/campaigns?matched=no" className="underline">
              Suggest one from the campaigns list
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-black/5">
            {sponsorships.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  <Link href={`/dashboard/admin/events/sponsored/${s.id}`} className="font-semibold underline">
                    {s.name}
                  </Link>{" "}
                  <span className="text-[var(--color-ink-soft)]">
                    {s.reference}
                    {s.artist_display_name ? ` · ${s.artist_display_name}` : ""}
                    {s.event_date ? ` · ${formatDate(s.event_date)}` : ""}
                    {s.status === "in_progress"
                      ? ` · brand ${s.brand_agreed ? "agreed" : "to agree"}, artist ${s.artist_agreed ? "agreed" : "to agree"}`
                      : ""}
                  </span>
                </span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
