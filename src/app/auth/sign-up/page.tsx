import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { googleSignInEnabled } from "@/lib/google-auth";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; event?: string; redirectTo?: string }>;
}) {
  const { role, event, redirectTo } = await searchParams;
  // A survey sends people here to make an account (Testing notes 7 Nov): keep
  // where they came from so the welcome email's link brings them back to it.
  const surveyReturn = redirectTo && /^\/survey\/[0-9a-f-]{36}$/i.test(redirectTo) ? redirectTo : undefined;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join the partnership ecosystem where everyone wins."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={surveyReturn ? `/auth/sign-in?redirectTo=${encodeURIComponent(surveyReturn)}` : "/auth/sign-in"}
            className="font-semibold text-[var(--color-brand)]"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm initialRole={role} event={event} returnTo={surveyReturn} googleEnabled={googleSignInEnabled()} />
    </AuthShell>
  );
}
