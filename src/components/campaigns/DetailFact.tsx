import type { ReactNode } from "react";

/** One labelled value on a brand's request / campaign page; renders nothing
 *  when the value is empty so optional fields don't leave blank headings. */
export function DetailFact({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">{label}</dt>
      <dd className="mt-1 whitespace-pre-line break-words">{value}</dd>
    </div>
  );
}
