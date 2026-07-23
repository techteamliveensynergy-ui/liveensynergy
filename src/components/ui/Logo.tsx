import Link from "next/link";

/** Live·En·Synergy wordmark lockup. */
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-baseline gap-1 text-xl leading-none">
      <span
        className={`font-serif italic ${light ? "text-white" : "text-[var(--color-ink)]"}`}
      >
        Live·En·
      </span>
      <span className="font-display font-bold tracking-tight text-[var(--color-brand)]">
        Synergy
      </span>
    </Link>
  );
}
