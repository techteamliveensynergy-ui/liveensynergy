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
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-ink)] p-10 text-white md:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[var(--color-brand)]/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-[var(--color-purple)]/20"
        />
        <Logo light />
        <div className="relative">
          <p className="font-serif text-lg text-white/70">
            Sponsorship, re-imagined
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight">
            Sponsorship where{" "}
            <span className="text-[var(--color-gold)]">everyone wins.</span>
          </h2>
          <p className="mt-4 max-w-sm text-white/70">
            Brands build meaningful connections, artists secure confirmed
            attendance, and audiences receive exclusive sponsor-funded rewards.
          </p>
        </div>
        <p className="relative text-sm text-white/50">
          © {new Date().getFullYear()} Live·En·Synergy
        </p>
      </div>

      <div className="flex flex-col justify-center bg-[var(--color-mist)] px-6 py-12 sm:px-12 md:bg-white">
        <div className="mx-auto w-full max-w-md">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="mt-6">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
              {title}
            </h1>
            <p className="mt-1 text-[var(--color-ink-soft)]">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-sm text-[var(--color-ink-soft)]">
            {footer}
          </div>
          <p className="mt-10 text-center text-xs text-[var(--color-ink-soft)]">
            <Link href="/" className="hover:text-[var(--color-brand-dark)]">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
