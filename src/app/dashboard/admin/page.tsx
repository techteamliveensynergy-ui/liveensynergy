import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, MetricTile, StatusBadge } from "@/components/dashboard/ui";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Admin console" };

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
) {
  const { count: c } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  return c ?? 0;
}

export default async function AdminPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();

  const headCount = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [
    users,
    campaignRows,
    sponsoredRows,
    listingRows,
    participationRows,
    enquiryRows,
    roleCounts,
    paidInvoiceRows,
    surveyStatRows,
    surveysToReview,
    newRequests,
    codesIssued,
    surveyParticipations,
  ] = await Promise.all([
    count(supabase, "profiles"),
    supabase
      .from("campaigns")
      .select("id, reference, description, target_name, status, matched_listing_id, created_at, brands(brand_name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("sponsored_events")
      .select("id, reference, name, status, brand_agreed, artist_agreed, campaign_id, event_date, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("event_listings").select("id, status"),
    supabase.from("participations").select("id, status, reward_amount_gbp"),
    supabase.from("contact_messages").select("id, subject, name, handled_at, created_at"),
    Promise.all(
      (["brand", "artist", "event", "audience"] as const).map((role) =>
        headCount(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", role)),
      ),
    ),
    supabase.from("invoices").select("amount_gbp, refunded_gbp, paid_at").eq("status", "paid"),
    // Running survey counters (0059) — a row per survey, not per response.
    supabase.from("survey_template_stats").select("pending_count, pass_count, review_count, reject_count"),
    headCount(supabase.from("survey_responses").select("id", { count: "exact", head: true }).eq("quality_status", "review")),
    headCount(supabase.from("campaign_intake_requests").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    headCount(supabase.from("reward_codes").select("id", { count: "exact", head: true }).neq("status", "void")),
    headCount(
      supabase
        .from("survey_responses")
        .select("id", { count: "exact", head: true })
        .not("participation_id", "is", null)
        .neq("quality_status", "reject"),
    ),
  ]);
  const [brandCount, artistCount, organiserCount, audienceCount] = roleCounts;

  const campaigns = campaignRows.data ?? [];
  const sponsored = sponsoredRows.data ?? [];
  const listings = listingRows.data ?? [];
  const participations = participationRows.data ?? [];
  const enquiries = enquiryRows.data ?? [];

  // --- the queue that actually needs a human ---
  const needsMatching = campaigns.filter((c) => !c.matched_listing_id);
  const awaitingAgreement = sponsored.filter(
    (e) => !e.brand_agreed || !e.artist_agreed,
  );
  const openEnquiries = enquiries.filter((e) => !e.handled_at);
  const verifiedUnrewarded = participations.filter(
    (p) => p.status === "attendance_verified",
  );

  const awaitingPayment = campaigns.filter((c) => c.status === "awaiting_payment");
  const liveDeals = sponsored.filter((e) => e.status === "confirmed");
  const liveCampaignIds = new Set(liveDeals.map((e) => e.campaign_id).filter(Boolean));
  const surveyTotals = ((surveyStatRows.data ?? []) as {
    pending_count: number; pass_count: number; review_count: number; reject_count: number;
  }[]).reduce(
    (t, r) => ({ counted: t.counted + r.pending_count + r.pass_count + r.review_count, rejected: t.rejected + r.reject_count }),
    { counted: 0, rejected: 0 },
  );
  // Revenue = paid invoices less refunds, inc. VAT. "This month" by London date.
  const monthPrefix = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date()).slice(0, 7);
  const paidInvoices = (paidInvoiceRows.data ?? []) as { amount_gbp: number; refunded_gbp: number; paid_at: string | null }[];
  const net = (i: { amount_gbp: number; refunded_gbp: number }) => Number(i.amount_gbp) - Number(i.refunded_gbp ?? 0);
  const revenueToDate = paidInvoices.reduce((t, i) => t + net(i), 0);
  const revenueThisMonth = paidInvoices
    .filter((i) => i.paid_at && new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(i.paid_at)).startsWith(monthPrefix))
    .reduce((t, i) => t + net(i), 0);
  const gbp = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

  const totalRewarded = participations.reduce(
    (sum, p) => sum + Number(p.reward_amount_gbp ?? 0),
    0,
  );

  // Order from the Admin Portal brief (9 Oct).
  const attention = [
    {
      label: "Campaigns to match",
      count: needsMatching.length,
      href: "/dashboard/admin/campaigns?matched=no",
      tint: "bg-[var(--color-gold)]",
    },
    {
      label: "Awaiting agreement",
      count: awaitingAgreement.length,
      href: "/dashboard/admin/events?tab=sponsored",
      tint: "bg-[var(--color-lavender)]",
    },
    {
      label: "Awaiting payment",
      count: awaitingPayment.length,
      href: "/dashboard/admin/campaigns?status=awaiting_payment",
      tint: "bg-[var(--color-lavender)]",
    },
    {
      label: "Surveys awaiting review",
      count: surveysToReview,
      href: "/dashboard/admin/surveys/responses?status=review",
      tint: "bg-[var(--color-gold)]",
    },
    {
      label: "Open enquiries",
      count: openEnquiries.length,
      href: "/dashboard/admin/enquiries?filter=open",
      tint: "bg-[var(--color-pink)]",
    },
    {
      label: "New campaign requests",
      count: newRequests,
      href: "/dashboard/admin/campaigns/intake",
      tint: "bg-[var(--color-mint)]",
    },
    {
      label: "Verified, unrewarded",
      count: verifiedUnrewarded.length,
      href: "/dashboard/admin/participants?status=attendance_verified",
      tint: "bg-[var(--color-sage)]",
    },
  ];

  const funnel = [
    { label: "Registered", n: participations.length },
    { label: "Took a survey", n: surveyParticipations },
    {
      label: "Proof uploaded",
      n: participations.filter((p) =>
        ["ticket_uploaded", "attendance_verified", "reward_released"].includes(
          p.status,
        ),
      ).length,
    },
    {
      label: "Verified",
      n: participations.filter((p) =>
        ["attendance_verified", "reward_released"].includes(p.status),
      ).length,
    },
    {
      label: "Rewarded",
      n: participations.filter((p) => p.status === "reward_released").length,
    },
  ];
  const pct = (n: number) =>
    participations.length ? Math.round((n / participations.length) * 100) : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin console"
        subtitle="What needs attention, and how the platform is performing."
      />

      {/* Needs attention */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Needs attention
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {attention.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className={`rounded-2xl border border-black/10 p-5 shadow-sm transition hover:-translate-y-0.5 ${a.tint}`}
            >
              <p className="font-display text-3xl font-semibold text-[var(--color-ink)]">
                {a.count}
              </p>
              <p className="mt-1 text-sm text-[var(--color-ink)]/75">{a.label}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Scale */}
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Platform
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricTile label="Users" value={users} />
          <MetricTile label="Brands" value={brandCount} />
          <MetricTile label="Artists" value={artistCount + organiserCount} hint={organiserCount ? `incl. ${organiserCount} pre-merge organisers` : undefined} />
          <MetricTile label="Audience" value={audienceCount} />
          <MetricTile label="Revenue this month" value={gbp(revenueThisMonth)} hint="paid invoices, inc. VAT, less refunds" />
          <MetricTile label="Revenue to date" value={gbp(revenueToDate)} hint="paid invoices, inc. VAT, less refunds" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-[var(--color-ink)]">
          Campaigns
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <MetricTile label="Campaigns launched" value={campaigns.length} />
          <MetricTile label="Campaigns live" value={liveCampaignIds.size} hint="event confirmed" />
          <MetricTile label="Surveys completed" value={surveyTotals.counted} hint="not rejected" />
          <MetricTile label="Surveys rejected" value={surveyTotals.rejected} />
          <MetricTile label="Codes issued" value={codesIssued} />
          <MetricTile
            label="Rewarded"
            value={`£${totalRewarded.toLocaleString("en-GB")}`}
            hint={`${listings.filter((l) => l.status === "available").length} listings open`}
          />
        </div>
      </section>

      <section className="card min-w-0 p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">Active campaigns</h2>
          <Link href="/dashboard/admin/campaigns?live=yes" className="text-sm font-semibold text-[var(--color-brand-dark)]">
            See all →
          </Link>
        </div>
        {liveDeals.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">No campaign is live right now.</p>
        ) : (
          <div className="space-y-2">
            {liveDeals.slice(0, 8).map((e) => {
              const c = campaigns.find((x) => x.id === e.campaign_id);
              return (
                <Link
                  key={e.id}
                  href={c ? `/dashboard/admin/campaigns/${c.id}` : `/dashboard/admin/events/sponsored/${e.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-2.5 text-sm transition hover:bg-white"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {c ? `${c.reference} · ${(c.brands as unknown as { brand_name: string } | null)?.brand_name ?? ""} — ` : ""}
                    {e.name}
                  </span>
                  <span className="text-xs text-[var(--color-ink-soft)]">{e.event_date ?? ""}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Funnel */}
      <section className="card p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          Audience funnel
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {funnel.map((s) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-[var(--color-ink-soft)]">
                  {s.label}
                </span>
                <span className="font-display text-lg font-semibold text-[var(--color-ink)]">
                  {s.n}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[var(--color-brand)]"
                  style={{ width: `${pct(s.n)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                {pct(s.n)}%
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* min-w-0: grid items default to min-width:auto and would otherwise
            size to the widest row's content, pushing the page sideways. */}
        <section className="card min-w-0 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Recent campaigns
            </h2>
            <Link
              href="/dashboard/admin/campaigns"
              className="text-sm font-semibold text-[var(--color-brand-dark)]"
            >
              See all →
            </Link>
          </div>
          {campaigns.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">No campaigns yet.</p>
          ) : (
            <div className="space-y-2">
              {campaigns.slice(0, 5).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {c.reference} — {c.description}
                  </span>
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {timeAgo(c.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* min-w-0: grid items default to min-width:auto and would otherwise
            size to the widest row's content, pushing the page sideways. */}
        <section className="card min-w-0 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              Recent sponsorships
            </h2>
            <Link
              href="/dashboard/admin/events"
              className="text-sm font-semibold text-[var(--color-brand-dark)]"
            >
              See all →
            </Link>
          </div>
          {sponsored.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-soft)]">
              No sponsored events yet.
            </p>
          ) : (
            <div className="space-y-2">
              {sponsored.slice(0, 5).map((e) => (
                <Link
                  key={e.id}
                  href={`/dashboard/admin/events/sponsored/${e.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-mist)] px-4 py-2.5 text-sm transition hover:bg-white"
                >
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <StatusBadge status={e.status} />
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {timeAgo(e.created_at)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
