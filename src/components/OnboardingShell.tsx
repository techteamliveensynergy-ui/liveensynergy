import type { ReactNode } from "react";
import { Logo } from "./ui/Logo";
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
      <header className="border-b border-black/5 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Logo />
          <span className="chip">{ROLE_LABELS[role]} setup</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-[var(--color-ink-soft)]">{subtitle}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

/** A titled group of related fields within an onboarding form. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="card p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
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
