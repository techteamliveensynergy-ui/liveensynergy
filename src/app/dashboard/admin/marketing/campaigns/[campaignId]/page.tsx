import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { campaignProblems, parseContent } from "@/lib/marketing/blocks";
import { renderCampaignEmail } from "@/lib/marketing/render";
import { loadBrandTokens, marketingConfig } from "@/lib/marketing/send";
import { isGenerateConfigured } from "@/lib/marketing/generate";
import { MarketingTabs, CampaignStatusChip } from "../../MarketingTabs";
import { CampaignEditor } from "./CampaignEditor";
import { CampaignControls } from "./CampaignControls";

export const metadata = { title: "Campaign · Marketing · Admin" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEND_STATUSES = ["queued", "sending", "sent", "delivered", "bounced", "complained", "failed", "skipped"] as const;
const SEND_LABEL: Record<(typeof SEND_STATUSES)[number], string> = {
  queued: "Waiting",
  sending: "In flight",
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed",
  skipped: "Skipped (unsubscribed since)",
};

type Campaign = {
  id: string;
  reference: string;
  brand_id: string;
  name: string;
  subject: string;
  preview_text: string;
  content: unknown;
  segment: { type: "all" | "events"; event_ids?: string[] };
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  paused_reason: string | null;
  test_sent_at: string | null;
  recipients: number;
  brands: { brand_name: string } | null;
};

export default async function MarketingCampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { profile } = await requireRole(["admin"]);
  const { campaignId } = await params;
  if (!UUID.test(campaignId)) notFound();
  const supabase = await createClient();

  const { data } = await supabase
    .from("marketing_campaigns")
    .select(
      "id, reference, brand_id, name, subject, preview_text, content, segment, status, scheduled_at, started_at, finished_at, paused_reason, test_sent_at, recipients, brands(brand_name)",
    )
    .eq("id", campaignId)
    .maybeSingle();
  const c = data as unknown as Campaign | null;
  if (!c) notFound();

  const tokens = await loadBrandTokens(supabase, c.brand_id);
  if (!tokens) notFound();
  const content = parseContent(c.content);
  const segment = c.segment?.type === "events" ? { type: "events" as const, event_ids: c.segment.event_ids ?? [] } : { type: "all" as const };
  const firstName = (profile.full_name ?? "").split(" ")[0] || null;

  const header = (
    <div className="mb-6">
      <Link href="/dashboard/admin/marketing" className="text-sm text-[var(--color-ink-soft)] hover:underline">
        ← All campaigns
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)]">{c.name}</h1>
        <CampaignStatusChip status={c.status} />
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
        {c.reference} · from{" "}
        <Link href={`/dashboard/admin/marketing/brands?brand=${c.brand_id}`} className="underline">
          {c.brands?.brand_name ?? tokens.brand_name}
        </Link>
        {c.test_sent_at ? ` · last test ${formatDateTime(c.test_sent_at)}` : " · no test sent yet"}
      </p>
    </div>
  );

  if (c.status === "draft") {
    const [{ data: events }, { data: count }] = await Promise.all([
      supabase
        .from("sponsored_events")
        .select("id, name, reference, event_date")
        .eq("brand_id", c.brand_id)
        .order("event_date", { ascending: false })
        .limit(200),
      supabase.rpc("marketing_audience_count", { p_brand_id: c.brand_id, p_segment: segment }),
    ]);
    const problems = campaignProblems({ subject: c.subject, content }, tokens);
    const { missing } = marketingConfig();
    if (missing) problems.push(`Sending isn't set up yet: ${missing}`);
    return (
      <div>
        <MarketingTabs active="campaigns" />
        {header}
        <CampaignEditor
          campaign={{ id: c.id, name: c.name, subject: c.subject, preview_text: c.preview_text, content, segment }}
          tokens={tokens}
          events={(events ?? []).map((e) => ({
            id: e.id as string,
            label: `${e.name as string}${e.reference ? ` (${e.reference as string})` : ""}${e.event_date ? ` · ${e.event_date as string}` : ""}`,
          }))}
          audienceCount={typeof count === "number" ? count : 0}
          problems={problems}
          adminEmail={profile.email ?? ""}
          adminFirstName={firstName}
          aiConfigured={isGenerateConfigured()}
        />
      </div>
    );
  }

  // Scheduled / sending / paused / sent / cancelled: progress + controls + read-only preview.
  const counts = await Promise.all(
    SEND_STATUSES.map(async (s) => {
      const { count } = await supabase
        .from("marketing_sends")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .eq("status", s);
      return [s, count ?? 0] as const;
    }),
  );
  const byStatus = Object.fromEntries(counts) as Record<(typeof SEND_STATUSES)[number], number>;
  const reached = byStatus.sent + byStatus.delivered + byStatus.bounced + byStatus.complained;
  const { data: failures } = await supabase
    .from("marketing_sends")
    .select("email, error")
    .eq("campaign_id", c.id)
    .eq("status", "failed")
    .limit(10);

  const html = renderCampaignEmail({
    subject: c.subject,
    previewText: c.preview_text,
    content,
    tokens,
    firstName,
    unsubscribeUrl: "https://example.invalid/unsubscribe-preview",
  }).html;

  return (
    <div>
      <MarketingTabs active="campaigns" />
      {header}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,640px)]">
        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="font-semibold text-[var(--color-ink)]">Where it is</h2>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-[var(--color-ink-soft)]">Subject</dt>
              <dd>{c.subject}</dd>
              {c.scheduled_at && (
                <>
                  <dt className="text-[var(--color-ink-soft)]">Scheduled</dt>
                  <dd>{formatDateTime(c.scheduled_at)}</dd>
                </>
              )}
              {c.started_at && (
                <>
                  <dt className="text-[var(--color-ink-soft)]">Started</dt>
                  <dd>{formatDateTime(c.started_at)}</dd>
                </>
              )}
              {c.finished_at && (
                <>
                  <dt className="text-[var(--color-ink-soft)]">{c.status === "cancelled" ? "Cancelled" : "Finished"}</dt>
                  <dd>{formatDateTime(c.finished_at)}</dd>
                </>
              )}
              <dt className="text-[var(--color-ink-soft)]">Audience</dt>
              <dd>
                {segment.type === "all" ? `Everyone subscribed to ${tokens.brand_name}` : `People who agreed at ${segment.event_ids.length} chosen event(s)`}
              </dd>
            </dl>
            {c.status === "paused" && c.paused_reason && (
              <p className="mt-3 rounded bg-[var(--color-pink)] p-3 text-sm text-[var(--color-accent)]">Paused: {c.paused_reason}</p>
            )}
          </section>

          {c.started_at && (
            <section className="card p-4">
              <h2 className="font-semibold text-[var(--color-ink)]">
                Progress — {reached} of {c.recipients} reached
              </h2>
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-black/10" aria-hidden>
                <div className="h-full bg-[var(--color-brand)]" style={{ width: `${c.recipients ? Math.min(100, (reached / c.recipients) * 100) : 0}%` }} />
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {SEND_STATUSES.map((s) => (
                  <li key={s} className="rounded border border-black/10 p-2">
                    <p className="text-xs text-[var(--color-ink-soft)]">{SEND_LABEL[s]}</p>
                    <p className="text-lg font-semibold tabular-nums">{byStatus[s]}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                Sending pauses itself if spam complaints pass 0.1% or bounces pass 2% of what&rsquo;s been sent. “Delivered” fills in as the
                provider reports back.
              </p>
              {(failures ?? []).length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold">Failures (first 10)</summary>
                  <ul className="mt-1 space-y-1">
                    {(failures ?? []).map((f, i) => (
                      <li key={i} className="text-[var(--color-ink-soft)]">
                        {f.email as string} — {(f.error as string | null) ?? "unknown"}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          <CampaignControls campaignId={c.id} status={c.status} started={!!c.started_at} />
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <h2 className="mb-2 font-semibold text-[var(--color-ink)]">What people receive</h2>
          <iframe title="Email preview" srcDoc={html} sandbox="" className="h-[75vh] w-full rounded border border-black/10 bg-white" />
        </div>
      </div>
    </div>
  );
}
