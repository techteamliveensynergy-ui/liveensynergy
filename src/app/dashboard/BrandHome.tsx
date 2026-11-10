import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assessProfile } from "@/lib/profile-completeness";
import { MetricTile } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import type { Campaign, CampaignIntakeRequest, Invoice, Profile, SponsoredEvent } from "@/lib/types";
import { formatEventDateTime } from "@/lib/event-time";
import { CampaignStageBadge } from "@/components/campaigns/CampaignStageBadge";
import { campaignStagesFor } from "@/lib/data/campaign-stages";
import type { CampaignStageKey } from "@/lib/campaign-stage";
import { CAMPAIGN_INTAKE_STATUS_LABELS, campaignTitle } from "@/lib/campaign-requests";
import { formatGbp } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { CAMPAIGN_COLUMNS } from "@/lib/campaign-columns";

import { ProfileLinks } from "@/components/dashboard/ProfileLinks";
/** Brand-facing words for where a campaign is (the badge says the stage). */
const CAMPAIGN_STAGE_NEXT: Record<CampaignStageKey, string> = {
  awaiting_payment: "Opens to artists once its invoice is paid.",
  needs_matching: "Our team is lining up the right artist or event.",
  awaiting_artist: "The artist is setting up the discount codes.",
  awaiting_survey: "Our team is finishing the audience survey.",
  ready_to_open: "Everything's ready — registration opens shortly.",
  live: "Live — the audience is registering and answering the survey.",
  completed: "Completed.",
  closed: "Closed.",
};

export async function BrandHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  // One read of the brand row serves both the completeness score and the page
  // (it was read twice, one after the other — QA 9 Nov, slow brand sign-in).
  const { data: brandRow } = await supabase
    .from("brands")
    .select("*")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const completeness = assessProfile(profile.role, brandRow);
  const brand = brandRow as { id: string; brand_name: string; product_category: string | null } | null;

  let campaigns: Campaign[] = [];
  let sponsored: SponsoredEvent[] = [];
  let requests: CampaignIntakeRequest[] = [];
  let openInvoices: Pick<Invoice, "id" | "reference" | "amount_gbp" | "status" | "due_date">[] = [];
  let checkedInCount = 0;

  if (brand) {
    const [{ data: campaignData }, { data: sponsoredData }, { data: requestData }, { data: invoiceData }] =
      await Promise.all([
        supabase
          .from("campaigns")
          .select(CAMPAIGN_COLUMNS)
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false })
          .overrideTypes<Campaign[], { merge: false }>(),
        supabase
          .from("sponsored_events")
          .select("*")
          .eq("brand_id", brand.id)
          .order("created_at", { ascending: false }),
        // Requests the team hasn't turned into a campaign yet.
        supabase
          .from("campaign_intake_requests")
          .select("*")
          .eq("brand_id", brand.id)
          .in("status", ["submitted", "in_review"])
          .order("created_at", { ascending: false }),
        supabase
          .from("invoices")
          .select("id, reference, amount_gbp, status, due_date")
          .eq("brand_id", brand.id)
          .in("status", ["sent", "overdue"]),
      ]);

    campaigns = (campaignData ?? []) as Campaign[];
    sponsored = (sponsoredData ?? []) as SponsoredEvent[];
    requests = (requestData ?? []) as CampaignIntakeRequest[];
    openInvoices = (invoiceData ?? []) as typeof openInvoices;

  }

  // Dashboard cards corrected (General Notes, 13 Oct): "active" counts every
  // campaign that isn't finished — awaiting payment included — and the list
  // below shows only those; closed/completed ones live on Campaigns live.
  const inFlight = campaigns.filter((c) => c.status === "awaiting_payment" || c.status === "in_progress");
  const activeCampaigns = inFlight.length;
  // Independent of each other — loaded together (QA 9 Nov).
  const sponsoredIds = sponsored.map((s) => s.id);
  const campaignIds = campaigns.map((c) => c.id);
  const [checkedIn, stages, { data: formRows }, { data: reportRows }] = await Promise.all([
    sponsoredIds.length > 0
      ? supabase
          .from("participations")
          .select("id", { count: "exact", head: true })
          .in("sponsored_event_id", sponsoredIds)
          .neq("status", "rejected") // Testing notes 7 Nov: participants, not check-ins (old model)
      : Promise.resolve({ count: 0 }),
    campaignStagesFor(supabase, inFlight, "brand"),
    // Order forms waiting for the brand's approval.
    campaignIds.length > 0
      ? supabase.from("campaign_order_forms").select("id, campaign_id").eq("status", "sent").in("campaign_id", campaignIds)
      : Promise.resolve({ data: [] }),
    // Survey reports the team has published to this brand (0115). Missing → none.
    brand ? supabase.rpc("brand_analysis_reports", { p_campaign_id: null }) : Promise.resolve({ data: [] }),
  ]);
  checkedInCount = checkedIn.count ?? 0;

  // What's next (QA 9 Nov: brands had no "what do I do now?"). What needs the
  // brand comes first; then where each campaign is with the team.
  const campaignName = (id: string | null | undefined) => {
    const c = campaigns.find((x) => x.id === id);
    return c ? campaignTitle(c, `Campaign ${c.reference}`) : "your campaign";
  };
  type NextItem = { key: string; text: string; detail?: string; href: string; cta: string; needsYou: boolean };
  const nextItems: NextItem[] = [];
  for (const f of (formRows ?? []) as { id: string; campaign_id: string }[]) {
    nextItems.push({
      key: `form-${f.id}`,
      text: `Review and approve the order form for ${campaignName(f.campaign_id)}`,
      detail: "Your invoice is sent as soon as you approve it.",
      href: `/order-forms/${f.id}`,
      cta: "Review",
      needsYou: true,
    });
  }
  for (const i of openInvoices) {
    nextItems.push({
      key: `inv-${i.id}`,
      text: `Pay invoice ${i.reference ?? ""} — ${formatGbp(Number(i.amount_gbp))}`.replace("  ", " "),
      detail: i.status === "overdue" ? "Overdue — your campaign opens to artists once it's paid." : "Your campaign opens to artists once it's paid.",
      href: `/dashboard/campaigns/invoices/${i.id}`,
      cta: "Pay",
      needsYou: true,
    });
  }
  for (const e of sponsored.filter((x) => x.status === "in_progress" && !x.brand_agreed && !x.cancelled_at)) {
    nextItems.push({
      key: `prop-${e.id}`,
      text: `Review the proposed event: ${e.name}`,
      detail: "The team has matched your campaign with this event — agree it to go ahead.",
      href: `/dashboard/sponsored/${e.id}`,
      cta: "Review",
      needsYou: true,
    });
  }
  const recentReports = ((reportRows ?? []) as { id: string; campaign_id: string; title: string; shared_at: string }[])
    .filter((r) => Date.now() - new Date(r.shared_at).getTime() < 30 * 24 * 60 * 60 * 1000);
  for (const r of recentReports) {
    nextItems.push({
      key: `rep-${r.id}`,
      text: `Read your survey report: ${r.title}`,
      detail: `Published for ${campaignName(r.campaign_id)}.`,
      href: `/dashboard/campaigns/live/${r.campaign_id}/reports/${r.id}`,
      cta: "Read",
      needsYou: true,
    });
  }
  const covered = new Set(nextItems.map((n) => n.key));
  for (const c of inFlight) {
    const stage = stages.get(c.id);
    if (!stage || covered.has(`camp-${c.id}`)) continue;
    nextItems.push({
      key: `camp-${c.id}`,
      text: `${campaignTitle(c, `Campaign ${c.reference}`)}: ${stage.label}`,
      detail: CAMPAIGN_STAGE_NEXT[stage.key],
      href: `/dashboard/campaigns/live/${c.id}`,
      cta: "View",
      needsYou: false,
    });
  }
  if (requests.length > 0) {
    nextItems.push({
      key: "requests",
      text: `${requests.length} campaign request${requests.length === 1 ? " is" : "s are"} with our team`,
      detail: "We'll be in touch within 3 days to set the campaign up.",
      href: "/dashboard/campaigns",
      cta: "View",
      needsYou: false,
    });
  }
  const needsYouCount = nextItems.filter((n) => n.needsYou).length;
  const liveEvents = sponsored.filter((s) => s.status === "confirmed");
  const toPay = openInvoices.reduce((sum, i) => sum + Number(i.amount_gbp), 0);

  return (
    <div>
      <div className="mb-8">
        <p className="font-serif text-[var(--color-ink-soft)]">
          {brand?.brand_name ?? "Brand"} workspace
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
          Welcome back, {profile.full_name?.split(" ")[0] ?? "there"}
        </h1>
        <p className="mt-2 text-[var(--color-ink-soft)]">
          {!brand
            ? "Finish your brand profile to start requesting partnership campaigns."
            : campaigns.length === 0 && requests.length === 0
              ? "Request your first partnership campaign — the Live·En·Synergy team matches it with artists and events."
              : `You have ${activeCampaigns} active campaign${activeCampaigns === 1 ? "" : "s"}${
                  requests.length > 0
                    ? ` and ${requests.length} request${requests.length === 1 ? "" : "s"} with our team`
                    : ""
                }.`}
        </p>
        <ProfileLinks role={profile.role} profileId={profile.id} />
      </div>

      <ProfileCompleteness completeness={completeness} className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Requests in review"
          value={requests.length}
          hint="with our team"
          tint="bg-[#faf5ee]"
        />
        <MetricTile
          label="Active campaigns"
          value={activeCampaigns}
          hint="not yet completed or closed"
          tint="bg-[var(--color-lavender)]"
        />
        <MetricTile
          label="Participants"
          value={checkedInCount}
          hint="registered across your events"
          tint="bg-[var(--color-sage)]"
        />
        <MetricTile
          label="To pay"
          value={formatGbp(toPay)}
          hint={
            openInvoices.length === 0
              ? "no invoices due"
              : `${openInvoices.length} invoice${openInvoices.length === 1 ? "" : "s"}`
          }
          tint="bg-[#fbeadd]"
        />
      </div>

      {brand && (
        <div className="card mt-6 p-6" data-testid="brand-whats-next">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">What&apos;s next</h2>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {nextItems.length === 0
              ? "Nothing waiting — request a campaign to get started."
              : needsYouCount > 0
                ? `${needsYouCount} thing${needsYouCount === 1 ? " needs" : "s need"} you.`
                : "Nothing needs you right now — here's where your campaigns are with our team."}
          </p>
          {nextItems.length > 0 && (
            <ul className="mt-3 divide-y divide-black/5">
              {nextItems.slice(0, 8).map((n) => (
                <li key={n.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.needsYou ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink)]"}`}>
                      {n.text}
                    </p>
                    {n.detail && <p className="text-xs text-[var(--color-ink-soft)]">{n.detail}</p>}
                  </div>
                  <Link href={n.href} className={`btn shrink-0 text-sm ${n.needsYou ? "btn-primary" : "btn-ghost"}`}>
                    {n.cta}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
                Campaigns in flight
              </h2>

            </div>
            <Link
              href="/dashboard/campaigns/live"
              className="text-sm font-semibold text-[var(--color-brand-dark)]"
            >
              See all →
            </Link>
          </div>
          {inFlight.length === 0 ? (
            <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
              No live campaigns yet. A campaign appears here as soon as our team sets it up from your request.
            </div>
          ) : (
            <div className="space-y-2">
              {inFlight.slice(0, 4).map((c) => {
                return (
                  <Link
                    key={c.id}
                    href={`/dashboard/campaigns/live/${c.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 transition hover:bg-white hover:shadow-sm"
                  >
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">
                        {campaignTitle(c, `Campaign ${c.reference}`)}
                      </p>
                      <p className="text-xs text-[var(--color-ink-soft)]">
                        Ref {c.reference}
                      </p>
                    </div>
                    {stages.get(c.id) && <CampaignStageBadge stage={stages.get(c.id)!} />}
                    <span className="text-xs text-[var(--color-ink-soft)]">
                      £{Number(c.budget_gbp ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 0 })}
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                      Manage →
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Was "Suggested for you" — the three newest listings, the same for
            every brand. Matching is done by the team now, so this shows the
            brand's own requests waiting on us instead (13 Oct). */}
        <div className="card bg-[var(--color-lavender)] p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Requests with our team
            </h2>
            <Link href="/dashboard/campaigns" className="text-sm font-semibold text-[var(--color-purple-deep)]">
              See all →
            </Link>
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-[var(--color-ink)]/70">
              Nothing waiting on us.{" "}
              <Link href="/dashboard/campaigns/new" className="font-semibold text-[var(--color-purple-deep)]">
                Request a campaign →
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {requests.slice(0, 4).map((r) => (
                <Link
                  key={r.id}
                  href={`/dashboard/campaigns/requests/${r.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 transition hover:shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                      {campaignTitle(r, `Request ${r.reference}`)}
                    </p>
                    <p className="truncate text-xs text-[var(--color-ink-soft)]">
                      Sent {formatDate(r.created_at)}
                    </p>
                  </div>
                  <span className="chip shrink-0">{CAMPAIGN_INTAKE_STATUS_LABELS[r.status]}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Confirmed sponsorships get their own section — the metric tile alone
          didn't tell the brand *which* deals are live. */}
      <div className="card mt-5 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Your events
            </h2>
            <p className="text-xs text-[var(--color-ink-soft)]">
              Events agreed for your campaigns — open one for its surveys,
              participants and discount codes.
            </p>
          </div>
          <Link
            href="/dashboard/sponsored"
            className="text-sm font-semibold text-[var(--color-brand-dark)]"
          >
            See all →
          </Link>
        </div>
        {liveEvents.length === 0 ? (
          <div className="rounded-xl bg-[var(--color-mist)] p-6 text-center text-sm text-[var(--color-ink-soft)]">
            No events agreed yet — once our team has matched your campaign with
            an event and it&apos;s agreed, it shows up here.
          </div>
        ) : (
          <div className="space-y-2">
            {liveEvents.slice(0, 5).map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/sponsored/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--color-mist)] p-4 transition hover:bg-white hover:shadow-sm"
              >
                <div>
                  <p className="font-semibold text-[var(--color-ink)]">
                    {s.name}
                  </p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    Ref {s.reference}
                    {s.event_date
                      ? ` · ${formatEventDateTime({ date: s.event_date, time: s.start_time, timeZone: s.timezone })}`
                      : ""}
                    {s.location ? ` · ${s.location}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[var(--color-brand-dark)]">
                  Open →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/campaigns/new"
          className="card block p-5 transition hover:-translate-y-0.5"
        >
          <h3 className="font-semibold text-[var(--color-ink)]">Request a campaign</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Tell us what you want to achieve — the team prices it and finds a fitting match.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link
          href="/dashboard/discover"
          className="card block p-5 transition hover:-translate-y-0.5"
        >
          <h3 className="font-semibold text-[var(--color-ink)]">Discover events</h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Browse events currently open for partnership.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
        <Link
          href="/dashboard/profile"
          className="card block p-5 transition hover:-translate-y-0.5"
        >
          <h3 className="font-semibold text-[var(--color-ink)]">
            {brand ? "Update your brand profile" : "Complete your brand profile"}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Add your mission, keywords and manager details.
          </p>
          <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
            Open →
          </span>
        </Link>
      </div>
    </div>
  );
}
