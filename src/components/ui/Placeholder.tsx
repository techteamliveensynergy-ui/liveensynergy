import type { ReactNode } from "react";

/**
 * A visually-present but deliberately non-functional section.
 *
 * Used where the design mocks specify a flow we haven't decided on or wired to
 * the database yet (audience interests, payout details, QR check-in). Keeping
 * these visible preserves the design intent and makes the remaining work easy
 * to find — search for `<Placeholder` to list everything still to build.
 *
 * These intentionally collect no data: no `name` attributes, nothing submitted.
 */
export function Placeholder({
  title,
  description,
  note,
  children,
}: {
  title: string;
  description?: string;
  /** Why it isn't live yet / what will happen instead in the meantime. */
  note?: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-[1.25rem] border border-dashed border-[var(--color-ink)]/25 bg-[var(--color-mist)] p-6">
      <div className="mb-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-lavender)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-purple-deep)]">
          Coming soon
        </span>
        <h2 className="mt-2 font-display text-lg font-semibold text-[var(--color-ink)]">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {description}
          </p>
        )}
      </div>
      {children && <div aria-hidden>{children}</div>}
      {note && (
        <p className="mt-4 rounded-xl bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[var(--color-ink-soft)]">
          {note}
        </p>
      )}
    </section>
  );
}

/** Non-interactive chip used inside a Placeholder to sketch a tag picker. */
export function PlaceholderChip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[var(--color-ink)]/15 bg-white px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink-soft)]">
      {label}
    </span>
  );
}
