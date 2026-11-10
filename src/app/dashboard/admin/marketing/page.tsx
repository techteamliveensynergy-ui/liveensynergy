import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { marketingConfig } from "@/lib/marketing/send";
import { MarketingTabs, CampaignStatusChip } from "./MarketingTabs";
import { NewCampaignForm } from "./NewCampaignForm";

export const metadata = { title: "Marketing · Admin" };

type Row = {
  id: string;
  reference: string;
  name: string;
  subject: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  recipients: number;
  paused_reason: string | null;
  created_at: string;
  brands: { brand_name: string } | null;
};

/**
 * Marketing → Campaigns: partner promotions emailed to people who ticked
 * "Partner newsletter & promotions" for that brand. Each email comes from the
 * brand, carries its own unsubscribe, and is sent by the worker in batches.
 */
export default async function MarketingCampaignsPage() {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const [{ data: rows }, { data: brands }, { data: pausedBrands }] = await Promise.all([
    supabase
      .from("marketing_campaigns")
      .select(
        "id, reference, name, subject, status, scheduled_at, started_at, finished_at, recipients, paused_reason, created_at, brands(brand_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("brands").select("id, brand_name").order("brand_name"),
    supabase.from("brand_marketing_settings").select("brand_id, paused_reason, brands(brand_name)").not("paused_at", "is", null),
  ]);
  const campaigns = (rows ?? []) as unknown as Row[];
  const { missing } = marketingConfig();

  return (
    <div>
      <MarketingTabs active="campaigns" />
      <PageHeader
        title="Marketing campaigns"
        subtitle="Promotions sent on behalf of a brand to people who agreed to hear from that brand. Every email carries the brand's footer and a one-click unsubscribe."
      />

      {missing && (
        <div className="card mb-5 border-l-4 border-[var(--color-accent)] p-4 text-sm">
          <p className="font-semibold text-[var(--color-ink)]">Sending isn&rsquo;t switched on yet</p>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            {missing} You can build and preview campaigns meanwhile. Setup steps: <code>docs/marketing-email-setup.md</code>.
          </p>
        </div>
      )}

      {(pausedBrands ?? []).length > 0 && (
        <div className="card mb-5 border-l-4 border-[var(--color-accent)] p-4 text-sm">
          <p className="font-semibold text-[var(--color-ink)]">Sending is paused for some brands</p>
          <ul className="mt-1 list-disc pl-5 text-[var(--color-ink-soft)]">
            {(pausedBrands as unknown as { brand_id: string; paused_reason: string | null; brands: { brand_name: string } | null }[]).map(
              (b) => (
                <li key={b.brand_id}>
                  <Link href={`/dashboard/admin/marketing/brands?brand=${b.brand_id}`} className="font-semibold underline">
                    {b.brands?.brand_name ?? "Brand"}
                  </Link>{" "}
                  — {b.paused_reason ?? "paused by an admin"}
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      <NewCampaignForm brands={(brands ?? []).map((b) => ({ id: b.id as string, name: b.brand_name as string }))} />

      {campaigns.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">
          No campaigns yet. Start one above — it stays a draft until you schedule it.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                <th className="px-5 py-3 font-semibold">Campaign</th>
                <th className="px-5 py-3 font-semibold">Brand</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">When</th>
                <th className="px-5 py-3 text-right font-semibold">Recipients</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {campaigns.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/admin/marketing/campaigns/${c.id}`}
                      className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand-dark)]"
                    >
                      {c.name}
                    </Link>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      {c.reference}
                      {c.subject ? ` · “${c.subject}”` : ""}
                    </p>
                  </td>
                  <td className="px-5 py-3">{c.brands?.brand_name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <CampaignStatusChip status={c.status} />
                    {c.status === "paused" && c.paused_reason && (
                      <p className="mt-1 max-w-xs text-xs text-[var(--color-accent)]">{c.paused_reason}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-[var(--color-ink-soft)]">
                    {c.status === "sent" || c.status === "cancelled"
                      ? formatDateTime(c.finished_at)
                      : c.started_at
                        ? `Started ${formatDateTime(c.started_at)}`
                        : c.scheduled_at
                          ? formatDateTime(c.scheduled_at)
                          : `Created ${formatDateTime(c.created_at)}`}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{c.started_at ? c.recipients : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
