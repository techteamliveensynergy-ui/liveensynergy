import Link from "next/link";

/** Live-En-Synergy wordmark. */
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2 font-bold text-lg">
      <span
        aria-hidden
        className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-brand)] text-white text-sm"
      >
        LE
      </span>
      <span className={light ? "text-white" : "text-[var(--color-ink)]"}>
        Live-En-Synergy
      </span>
    </Link>
  );
}
