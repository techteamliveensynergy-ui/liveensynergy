import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { requireProfile } from "@/lib/profile";
import { navForRole } from "@/lib/dashboard-nav";
import { ROLE_LABELS } from "@/lib/constants";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireProfile();

  // No profile row yet, or onboarding not finished → route to onboarding.
  if (!profile) redirect("/onboarding");
  if (!profile.onboarding_completed) redirect(`/onboarding/${profile.role}`);

  const nav = navForRole(profile.role);

  return (
    <div className="min-h-screen bg-[var(--color-mist)] md:flex">
      <Sidebar
        nav={nav}
        roleLabel={ROLE_LABELS[profile.role]}
        userName={profile.full_name ?? "Your account"}
        userEmail={user.email ?? ""}
      />
      <div className="flex-1">
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
