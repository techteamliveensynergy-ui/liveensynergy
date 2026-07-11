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
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
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
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
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

const STATUS_STYLES: Record<string, string> = {
  in_progress: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  closed: "bg-gray-200 text-gray-700",
  draft: "bg-gray-200 text-gray-700",
  available: "bg-green-100 text-green-800",
  matched: "bg-blue-100 text-blue-800",
  registered: "bg-amber-100 text-amber-800",
  ticket_uploaded: "bg-blue-100 text-blue-800",
  attendance_verified: "bg-indigo-100 text-indigo-800",
  reward_released: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700";
  const label = status.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cls}`}
    >
      {label}
    </span>
  );
}
