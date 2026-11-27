import Link from "next/link";

/**
 * Live·En·Synergy wordmark, set in Barrio (client, 27 Nov). `light` is for
 * dark surfaces (the sign-in screens, the dashboard navigation): cream with
 * "Synergy" in lime. Otherwise ink with "Synergy" in the brand colour.
 */
export function Logo({ light = false, size = "md" }: { light?: boolean; size?: "md" | "lg" }) {
  return (
    <Link
      href="/"
      aria-label="Live·En·Synergy"
      className={`inline-flex items-baseline gap-0.5 font-wordmark leading-none ${
        size === "lg" ? "text-4xl" : "text-2xl"
      }`}
    >
      <span className={light ? "text-[var(--color-les-cream)]" : "text-[var(--color-ink)]"}>Live·En·</span>
      <span className={light ? "text-[var(--color-les-lime)]" : "text-[var(--color-brand)]"}>Synergy</span>
    </Link>
  );
}
