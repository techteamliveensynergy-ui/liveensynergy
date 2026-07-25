import Link from "next/link";
import type { Completeness } from "@/lib/profile-completeness";

/**
 * The "complete your profile" nudge. Renders nothing once the profile is done,
 * and turns into a hard warning when the missing fields are ones that block
 * creating events or campaigns.
 */
export function ProfileCompleteness({
  completeness,
  className = "",
}: {
  completeness: Completeness;
  className?: string;
}) {
  if (completeness.complete) return null;

  const blocked = completeness.blocking.length > 0;

  return (
    <div
      className={`card p-5 ${blocked ? "bg-[var(--color-pink)]/50" : "bg-[var(--color-gold)]/40"} ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--color-ink)]">
            {blocked ? "Finish your profile to continue" : "Complete your profile"}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-ink)]/80">
            {blocked
              ? "You'll need these before you can create events or campaigns:"
              : "A fuller profile gets you sharper matches."}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[var(--color-ink)]">
          {completeness.percent}% complete
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full bg-[var(--color-brand)] transition-all"
          style={{ width: `${completeness.percent}%` }}
        />
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {(blocked ? completeness.blocking : completeness.missing).map((f) => (
          <li
            key={f.key}
            className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-ink-soft)]"
          >
            {f.label}
          </li>
        ))}
      </ul>

      <Link
        href="/dashboard/profile"
        className={`mt-4 inline-block ${blocked ? "btn btn-primary" : "text-sm font-semibold text-[var(--color-brand-dark)]"}`}
      >
        {blocked ? "Complete my profile" : "Update your profile →"}
      </Link>
    </div>
  );
}
