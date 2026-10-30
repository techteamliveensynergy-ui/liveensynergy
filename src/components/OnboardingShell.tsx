import type { ReactNode } from "react";
import { Logo } from "./ui/Logo";
import { FeedbackWidget } from "./FeedbackWidget";
import { ROLE_LABELS, type Role } from "@/lib/constants";

interface OnboardingShellProps {
  role: Role;
  /** The new user's name, for the welcome line (falls back to no name). */
  name?: string | null;
  /** What this role's profile is for — shown under "Let's get your profile set up!". */
  subtitle: string;
  /** Notices above the welcome card (email confirmed / please confirm). Passed
   *  in by the page: this module is also imported by client forms, so it can't
   *  pull in server-only components itself. */
  notices?: ReactNode;
  children: ReactNode;
}

/** What each kind of account gets out of the platform — the welcome card's
 *  one-liner (client request, 13 Oct: welcome first, then profile set-up). */
const WELCOME_LINES: Record<Role, string> = {
  brand:
    "Reach engaged audiences at live events. Our team turns your goals into partnership campaigns and pairs you with the right artists and events.",
  artist:
    "Get your shows and events partnered by brands that suit your audience — and give your fans rewards for coming.",
  event:
    "Get your events partnered by brands that suit your audience — and give attendees rewards for coming.",
  audience:
    "Discover live events near you and unlock partner-funded rewards just for going.",
  admin: "You're set up as part of the Live·En·Synergy team.",
};

export function OnboardingShell({
  role,
  name,
  subtitle,
  notices,
  children,
}: OnboardingShellProps) {
  const firstName = name?.trim().split(/\s+/)[0];
  return (
    <div className="min-h-screen bg-[var(--color-mist)]">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Logo />
          <span className="chip">{ROLE_LABELS[role]} setup</span>
        </div>
      </header>
      {/* pb-28 so the form's submit row clears the fixed feedback tab. */}
      <main className="mx-auto max-w-3xl px-5 pb-28 pt-10">
        {notices}
        {/* Welcome first, then the set-up (client request, 13 Oct) — for
            every account type. */}
        <section
          aria-labelledby="welcome-title"
          className="mb-8 rounded-2xl bg-[var(--color-gold)]/45 px-6 py-6"
        >
          <p className="text-3xl" aria-hidden>
            👋
          </p>
          <h1
            id="welcome-title"
            className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl"
          >
            Welcome to Live·En·Synergy{firstName ? `, ${firstName}` : ""}!
          </h1>
          <p className="mt-2 text-[var(--color-ink)]/80">{WELCOME_LINES[role]}</p>
        </section>

        <div className="mb-6">
          <h2 className="font-display text-xl font-semibold tracking-tight text-[var(--color-ink)] md:text-2xl">
            Let&apos;s get your profile set up!
          </h2>
          <p className="mt-2 text-[var(--color-ink-soft)]">{subtitle}</p>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            You can change any of this later from your profile.
          </p>
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
