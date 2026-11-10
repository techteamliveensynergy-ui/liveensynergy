import Link from "next/link";
import { requireRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { loadBrandTokens } from "@/lib/marketing/send";
import { MarketingTabs } from "../MarketingTabs";
import { BrandSettingsForm, BrandPauseForm } from "./BrandSettingsForm";

export const metadata = { title: "Brand settings · Marketing · Admin" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Settings = {
  brand_id: string;
  logo_url: string | null;
  accent_color: string | null;
  background: "light" | "dark";
  font_stack: string | null;
  footer_legal: string | null;
  physical_address: string | null;
  reply_to: string | null;
  paused_at: string | null;
  paused_reason: string | null;
  updated_at: string;
};

/**
 * Per-brand look (logo, accent, light/dark, font), the legal footer (company
 * line, the physical address the law requires) and reply-to — plus the
 * brand-wide pause the complaint/bounce guard trips.
 */
export default async function MarketingBrandsPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  await requireRole(["admin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: brands }, { data: settingsRows }, { data: subRows }] = await Promise.all([
    supabase.from("brands").select("id, brand_name").order("brand_name"),
    supabase.from("brand_marketing_settings").select("*"),
    supabase.from("brand_subscriptions").select("brand_id").eq("status", "subscribed"),
  ]);
  const settings = new Map(((settingsRows ?? []) as Settings[]).map((s) => [s.brand_id, s]));
  const subscribers = new Map<string, number>();
  for (const r of (subRows ?? []) as { brand_id: string }[]) subscribers.set(r.brand_id, (subscribers.get(r.brand_id) ?? 0) + 1);

  const selectedId = sp.brand && UUID.test(sp.brand) ? sp.brand : null;
  const selected = selectedId ? (brands ?? []).find((b) => b.id === selectedId) : null;
  const tokens = selected ? await loadBrandTokens(supabase, selected.id as string) : null;
  const own = selected ? settings.get(selected.id as string) : undefined;

  return (
    <div>
      <MarketingTabs active="brands" />
      <PageHeader
        title="Brand settings"
        subtitle="How each brand's emails look and what their footer says. Blank fields fall back to the brand's profile (logo, company address, manager email)."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <ul className="card divide-y divide-black/10 self-start">
          {(brands ?? []).map((b) => {
            const s = settings.get(b.id as string);
            return (
              <li key={b.id as string}>
                <Link
                  href={`/dashboard/admin/marketing/brands?brand=${b.id as string}`}
                  className={`block px-4 py-3 text-sm hover:bg-black/5 ${b.id === selectedId ? "bg-black/5 font-semibold" : ""}`}
                  aria-current={b.id === selectedId ? "page" : undefined}
                >
                  <span className="text-[var(--color-ink)]">{b.brand_name as string}</span>
                  <span className="block text-xs text-[var(--color-ink-soft)]">
                    {subscribers.get(b.id as string) ?? 0} subscribed
                    {s?.paused_at ? " · ⏸ paused" : ""}
                    {!s ? " · defaults" : ""}
                  </span>
                </Link>
              </li>
            );
          })}
          {(brands ?? []).length === 0 && <li className="px-4 py-3 text-sm text-[var(--color-ink-soft)]">No brands yet.</li>}
        </ul>

        <div>
          {!selected || !tokens ? (
            <div className="card p-10 text-center text-sm text-[var(--color-ink-soft)]">Choose a brand on the left.</div>
          ) : (
            <div className="space-y-5">
              {own?.paused_at && (
                <div className="card border-l-4 border-[var(--color-accent)] p-4 text-sm">
                  <p className="font-semibold text-[var(--color-ink)]">Sending is paused for {selected.brand_name as string}</p>
                  <p className="mt-1 text-[var(--color-ink-soft)]">
                    Since {formatDateTime(own.paused_at)} — {own.paused_reason ?? "paused by an admin"}. Look at what caused it (the
                    campaign&rsquo;s bounces and complaints) before resuming.
                  </p>
                </div>
              )}
              <BrandSettingsForm
                brandId={selected.id as string}
                brandName={selected.brand_name as string}
                own={{
                  logo_url: own?.logo_url ?? "",
                  accent_color: own?.accent_color ?? "",
                  background: own?.background ?? "light",
                  font_stack: own?.font_stack ?? "",
                  footer_legal: own?.footer_legal ?? "",
                  physical_address: own?.physical_address ?? "",
                  reply_to: own?.reply_to ?? "",
                }}
                effective={tokens}
              />
              <BrandPauseForm brandId={selected.id as string} paused={!!own?.paused_at} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
