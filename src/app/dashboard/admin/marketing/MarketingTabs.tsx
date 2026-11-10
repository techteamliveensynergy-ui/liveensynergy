import Link from "next/link";

const TABS = [
  { key: "campaigns", href: "/dashboard/admin/marketing", label: "Campaigns" },
  { key: "subscribers", href: "/dashboard/admin/marketing/subscribers", label: "Subscribers" },
  { key: "brands", href: "/dashboard/admin/marketing/brands", label: "Brand settings" },
] as const;

/** The Marketing tab's own sub-navigation. */
export function MarketingTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Marketing" className="mb-6 flex flex-wrap gap-2 border-b border-black/10 pb-3">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
            t.key === active
              ? "bg-[var(--color-ink)] text-white"
              : "text-[var(--color-ink-soft)] hover:bg-black/5 hover:text-[var(--color-ink)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  cancelled: "Cancelled",
};

export const CAMPAIGN_STATUS_CLASS: Record<string, string> = {
  draft: "bg-[var(--color-mist)] text-[var(--color-ink-soft)]",
  scheduled: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  sending: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  paused: "bg-[var(--color-pink)] text-[var(--color-accent)]",
  sent: "bg-[var(--color-sage)] text-[var(--color-ink)]",
  cancelled: "bg-black/5 text-[var(--color-ink-soft)]",
};

export function CampaignStatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${CAMPAIGN_STATUS_CLASS[status] ?? CAMPAIGN_STATUS_CLASS.draft}`}
    >
      {CAMPAIGN_STATUS_LABEL[status] ?? status}
    </span>
  );
}
