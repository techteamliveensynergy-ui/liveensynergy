import Link from "next/link";
import { requireProfile } from "@/lib/profile";
import { PageHeader } from "@/components/dashboard/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, profile } = await requireProfile();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Manage your account details."
      />

      <SettingsForm fullName={profile?.full_name ?? ""} />

      <div className="card grid gap-3 p-6 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--color-ink-soft)]">Email</span>
          <span className="font-medium">{user.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--color-ink-soft)]">Account type</span>
          <span className="font-medium">
            {profile ? ROLE_LABELS[profile.role] ?? profile.role : "—"}
          </span>
        </div>
      </div>

      <Link
        href="/dashboard/resources"
        className="card block p-6 transition hover:-translate-y-0.5"
      >
        <h2 className="text-lg font-semibold">Repository</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          How-it-works videos, blog, FAQs, sponsor and artist guidelines, terms
          &amp; conditions and the pricing structure.
        </p>
        <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
          Open repository →
        </span>
      </Link>

      <Link
        href="/dashboard/feedback"
        className="card block p-6 transition hover:-translate-y-0.5"
      >
        <h2 className="text-lg font-semibold">Report a bug or suggest an idea</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Spotted something broken, or want a wording change? Send it straight
          to the team, with a screenshot if it helps.
        </p>
        <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-brand-dark)]">
          Open feedback form →
        </span>
      </Link>

      <div className="card p-6">
        <h2 className="text-lg font-semibold">Password</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Set a new password for your account.
        </p>
        <a href="/auth/reset-password" className="btn btn-ghost mt-4">
          Change password
        </a>
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold">Sign out</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Sign out of your Live·En·Synergy account on this device.
        </p>
        <form action="/auth/sign-out" method="post" className="mt-4">
          <button type="submit" className="btn btn-ghost">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
