import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { profileCompleteness } from "@/lib/profile";
import { MetricTile } from "@/components/dashboard/ui";
import { ProfileCompleteness } from "@/components/dashboard/ProfileCompleteness";
import type { Campaign, CampaignIntakeRequest, Invoice, Profile, SponsoredEvent } from "@/lib/types";
import { formatEventDateTime } from "@/lib/event-time";
import { CampaignStageBadge } from "@/components/campaigns/CampaignStageBadge";
import { campaignStagesFor } from "@/lib/data/campaign-stages";
import { CAMPAIGN_INTAKE_STATUS_LABELS, campaignTitle } from "@/lib/campaign-requests";
import { formatGbp } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { CAMPAIGN_COLUMNS } from "@/lib/campaign-columns";

export async function BrandHome({ profile }: { profile: Profile }) {
  const supabase = await createClient();
  const completeness = await profileCompleteness(profile);

  const { data: brand } = await supabase
    .from("brands")
    .select("id, brand_name, product_category")
    .eq("profile_id", profile.id)
    .maybeSingle();

  let campaigns: Campaign[] = [];
  let sponsored: SponsoredEvent[] = [];
  let requests: CampaignIntakeRequest[] = [];
  let openInvoices: Pick<Invoice, "id" | "amount_gbp" | "status" | "due_date">[] = [];
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
          .select("id, amount_gbp, status, due_date")
          .eq("brand_id", brand.id)
          .in("status", ["sent", "overdue"]),
      ]);

    campaigns = (campaignData ?? []) as Campaign[];
    sponsored = (sponsoredData ?? []) as SponsoredEvent[];
    requests = (requestData ?? []) as CampaignIntakeRequest[];
    openInvoices = (invoiceData ?? []) as typeof openInvoices;

    const sponsoredIds = sponsored.map((s) => s.id);
    if (sponsoredIds.length > 0) {
      const { count } = await supabase
        .from("participations")
        .select("id", { count: "exact", head: true })
        .in("sponsored_event_id", sponsoredIds)
        .not("attendance_verified_at", "is", null);
      checkedInCount = count ?? 0;
    }
  }

  // Dashboard cards corrected (General Notes, 13 Oct): "active" counts every
  // campaign that isn't finished — awaiting payment included — and the list
  // below shows only those; closed/completed ones live on Campaigns live.
  const inFlight = campaigns.filter((c) => c.status === "awaiting_payment" || c.status === "in_progress");
  const activeCampaigns = inFlight.length;
  const stages = await campaignStagesFor(supabase, inFlight.slice(0, 4), "brand");
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
            ? "Finish your brand profile to start requesting sponsorship campaigns."
            : campaigns.length === 0 && requests.length === 0
              ? "Request your first sponsorship campaign — the Live·En·Synergy team matches it with artists and events."
              : `You have ${activeCampaigns} active campaign${activeCampaigns === 1 ? "" : "s"}${
                  requests.length > 0
                    ? ` and ${requests.length} request${requests.length === 1 ? "" : "s"} with our team`
                    : ""
                }.`}
        </p>
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
          label="Attendees checked in"
          value={checkedInCount}
          hint="across your events"
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
              No active campaigns.{" "}
              <Link
                href="/dashboard/campaigns/new"
                className="font-semibold text-[var(--color-brand-dark)]"
              >
                Request one →
              </Link>
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
                        {campaignTitle(c, "Sponsorship campaign")}
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
                      {campaignTitle(r, "Campaign request")}
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
            Browse events currently open for sponsorship.
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
