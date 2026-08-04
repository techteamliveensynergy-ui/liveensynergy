import type { ReactNode } from "react";
import { Logo } from "./ui/Logo";
import { FeedbackWidget } from "./FeedbackWidget";
import { ROLE_LABELS, type Role } from "@/lib/constants";

interface OnboardingShellProps {
  role: Role;
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function OnboardingShell({
  role,
  title,
  subtitle,
  children,
}: OnboardingShellProps) {
  return (
    <div className="min-h-screen bg-[var(--color-mist)]">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Logo />
          <span className="chip">{ROLE_LABELS[role]} setup</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-8">
          <p className="font-serif text-sm text-[var(--color-ink-soft)]">
            Phase 2 · onboarding
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-[var(--color-ink-soft)]">{subtitle}</p>
        </div>
        {children}
      </main>
      {/* Onboarding sits outside the dashboard layout, so the feedback tab is
          mounted here too — it's where new testers hit problems first. */}
      <FeedbackWidget />
    </div>
  );
}

/** A titled group of related fields within an onboarding form. */
export function FormSection({
  title,
  description,
  private: isPrivate,
  children,
}: {
  title: string;
  description?: string;
  /** Marks the section as internal-only (matching engine, not public profile). */
  private?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="card p-6">
      <div className="mb-5">
        {isPrivate && (
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-lavender)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-purple-deep)]">
            🔒 Private · Live·En·Synergy team only
          </span>
        )}
        <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            {description}
          </p>
        )}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
