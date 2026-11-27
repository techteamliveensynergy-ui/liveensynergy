import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "./ui/Logo";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Split-screen wrapper shared by the sign-in and sign-up pages — the new dark
 * theme (client, 27 Nov): ink background, lime accents, the Barrio wordmark.
 * `les-site` re-points the shared tokens so every form inside reads light-on-dark.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="les-site les-auth grid min-h-screen md:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-les-ink)] p-10 md:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[var(--color-les-lime)]/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/4 h-56 w-56 rounded-full bg-[var(--color-les-teal)]/15"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-[var(--color-les-coral)]/20"
        />
        <Logo light size="lg" />
        <div className="relative">
          <p className="les-eyebrow">Partnership, re-imagined</p>
          <h2 className="mt-3 text-5xl font-black uppercase leading-[0.95] text-[var(--color-les-cream)]">
            Partnership where <span className="text-[var(--color-les-lime)]">everyone wins.</span>
          </h2>
          <p className="mt-5 max-w-sm text-[var(--color-les-muted)]">
            Brands build meaningful connections, artists secure confirmed attendance, and audiences receive exclusive
            partner-funded rewards.
          </p>
        </div>
        <p className="relative text-sm text-[var(--color-les-muted)]">© {new Date().getFullYear()} Live·En·Synergy</p>
      </div>

      <div className="flex flex-col justify-center border-l border-[var(--color-les-line)] bg-[var(--color-les-panel)] px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="md:hidden">
            <Logo light />
          </div>
          <div className="mt-6">
            <h1 className="text-4xl font-black uppercase leading-none text-[var(--color-les-cream)]">{title}</h1>
            <p className="mt-2 text-[var(--color-ink-soft)]">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-sm text-[var(--color-ink-soft)]">{footer}</div>
          <p className="mt-10 text-center text-xs text-[var(--color-ink-soft)]">
            <Link href="/" className="hover:text-[var(--color-les-lime)]">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
