import type { ReactNode } from "react";
import Link from "next/link";

/** Page header with a title, optional subtitle and an optional action slot. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-ink)] md:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-xl text-[var(--color-ink-soft)]">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Empty-state card with an optional call to action. */
export function EmptyState({
  icon = "📭",
  title,
  body,
  cta,
}: {
  icon?: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="card p-10 text-center">
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <h2 className="mt-3 text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-ink-soft)]">
        {body}
      </p>
      {cta && (
        <Link href={cta.href} className="btn btn-primary mt-5">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

/** Dashboard-home metric tile — value + label on a tinted card. */
export function MetricTile({
  label,
  value,
  hint,
  tint = "bg-[var(--color-mist)]",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tint?: string;
}) {
  return (
    <div className={`rounded-2xl border border-black/10 p-5 shadow-sm ${tint}`}>
      <p className="text-xs text-[var(--color-ink-soft)]">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-[var(--color-ink)]">
          {value}
        </span>
      </div>
      {hint && (
        <p className="mt-1 text-xs font-medium text-[var(--color-ink-soft)]">
          {hint}
        </p>
      )}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  in_progress: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  confirmed: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  completed: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  closed: "bg-[var(--color-pink)] text-[var(--color-accent)]",
  draft: "bg-[var(--color-mint)] text-[var(--color-ink-soft)]",
  available: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  matched: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  registered: "bg-[var(--color-gold)] text-[var(--color-ink)]",
  ticket_uploaded: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  attendance_verified: "bg-[var(--color-lavender)] text-[var(--color-purple-deep)]",
  reward_released: "bg-[var(--color-sage)] text-[var(--color-olive-deep)]",
  rejected: "bg-[var(--color-pink)] text-[var(--color-accent)]",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-[var(--color-mist)] text-[var(--color-ink-soft)]";
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}
    >
      {label}
    </span>
  );
}
