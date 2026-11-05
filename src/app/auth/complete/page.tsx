import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { requireProfile } from "@/lib/profile";
import { safeRedirectPath } from "@/lib/urls";
import { needsGoogleCompletion } from "@/lib/google-auth";
import { signupRoleOrNull } from "@/lib/google-signin";
import { CompleteForm } from "./CompleteForm";

export const metadata = { title: "Finish setting up" };

/**
 * Where a brand-new Google account lands (see finishGoogleSignIn): Google has
 * proved the name and email, so this only asks what Google can't — role, Terms,
 * and a mobile number for an audience account.
 */
export default async function CompleteSignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; role?: string; locked?: string }>;
}) {
  const { next, role, locked } = await searchParams;
  const { user, profile } = await requireProfile();
  const dest = safeRedirectPath(next, "/onboarding");
  if (!needsGoogleCompletion(user, profile)) redirect(dest);

  const presetRole = signupRoleOrNull(role);
  return (
    <AuthShell
      title="One last step"
      subtitle={`Welcome${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} — tell us how you'll use Live·En·Synergy.`}
      footer={<>Signed in as {profile?.email ?? user.email}.</>}
    >
      <CompleteForm next={dest} initialRole={presetRole} lockRole={locked === "1" && presetRole === "audience"} />
    </AuthShell>
  );
}
