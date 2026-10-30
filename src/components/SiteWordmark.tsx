import Link from "next/link";

/** The public site's poster wordmark (#82). The dashboard keeps <Logo />. */
export function SiteWordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`les-poster text-[20px] leading-none tracking-tight text-[var(--color-les-lime)] ${className}`}
    >
      LIVE EN SYNERGY
    </Link>
  );
}
