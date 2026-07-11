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

      <div className="card p-6">
        <h2 className="text-lg font-semibold">Sign out</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
          Sign out of your Live-En-Synergy account on this device.
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
