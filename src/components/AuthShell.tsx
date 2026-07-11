import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "./ui/Logo";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/** Split-screen wrapper shared by the sign-in and sign-up pages. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-[var(--color-ink)] p-10 text-white md:flex">
        <Logo light />
        <div>
          <h2 className="text-3xl font-bold leading-tight">
            Sponsorship where{" "}
            <span className="text-[var(--color-gold)]">everyone wins.</span>
          </h2>
          <p className="mt-4 max-w-sm text-white/70">
            Brands build meaningful connections, artists secure confirmed
            attendance, and audiences receive exclusive sponsor-funded rewards.
          </p>
        </div>
        <p className="text-sm text-white/50">
          © {new Date().getFullYear()} Live-En-Synergy
        </p>
      </div>

      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="mt-6">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-[var(--color-ink-soft)]">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-sm text-[var(--color-ink-soft)]">
            {footer}
          </div>
          <p className="mt-10 text-center text-xs text-[var(--color-ink-soft)]">
            <Link href="/" className="hover:text-[var(--color-brand)]">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
