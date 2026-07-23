import { redirect } from "next/navigation";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { requireProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { navForRole } from "@/lib/dashboard-nav";
import { ROLE_LABELS } from "@/lib/constants";

const WORKSPACE_TABLE: Partial<
  Record<string, { table: string; name: string; category: string }>
> = {
  brand: { table: "brands", name: "brand_name", category: "product_category" },
  artist: { table: "artists", name: "artist_name", category: "category" },
  event: { table: "event_organisers", name: "event_name", category: "category" },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireProfile();

  // No profile row yet, or onboarding not finished → route to onboarding.
  if (!profile) redirect("/onboarding");

  // Deactivated accounts can't use the dashboard.
  if (!profile.is_active) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--color-mist)] p-6">
        <div className="card max-w-md p-8 text-center">
          <div className="text-4xl" aria-hidden>
            🔒
          </div>
          <h1 className="mt-3 font-display text-xl font-bold text-[var(--color-ink)]">Account deactivated</h1>
          <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
            Your account has been deactivated. If you think this is a mistake,
            please contact the Live·En·Synergy team.
          </p>
          <form action="/auth/sign-out" method="post" className="mt-5">
            <button type="submit" className="btn btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!profile.onboarding_completed) redirect(`/onboarding/${profile.role}`);

  const nav = navForRole(profile.role);

  let workspaceName: string | undefined;
  let workspaceSubtitle: string | undefined;
  const workspace = WORKSPACE_TABLE[profile.role];
  if (workspace) {
    const supabase = await createClient();
    const { data } = await supabase
      .from(workspace.table)
      .select(`${workspace.name}, ${workspace.category}`)
      .eq("profile_id", profile.id)
      .maybeSingle<Record<string, string | null>>();
    workspaceName = data?.[workspace.name] ?? undefined;
    workspaceSubtitle = data?.[workspace.category] ?? undefined;
  }

  return (
    <div className="min-h-screen bg-[var(--color-mist)] md:flex">
      <Sidebar
        nav={nav}
        roleLabel={ROLE_LABELS[profile.role]}
        userName={profile.full_name ?? "Your account"}
        userEmail={user.email ?? ""}
        workspaceName={workspaceName}
        workspaceSubtitle={workspaceSubtitle}
      />
      <div className="flex-1">
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </div>
    </div>
  );
}
