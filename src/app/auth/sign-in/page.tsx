import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

/** Why an email link sent the user here (src/app/auth/callback/route.ts). */
const LINK_ERRORS: Record<string, string> = {
  "confirm-link":
    "We couldn't sign you in from that link — it may have been opened in a different browser. If you were confirming your email, it's most likely confirmed: sign in below.",
  "link-expired": "That link has expired or was already used. Sign in below, or create your account again if you never confirmed it.",
  "reset-link":
    "That password-reset link has expired or was opened in a different browser. Use “Forgot password?” to get a new one.",
  auth: "We couldn't sign you in from that link. Please sign in below.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const { redirectTo, error } = await searchParams;
  const linkError = error ? LINK_ERRORS[error] ?? LINK_ERRORS.auth : null;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Live·En·Synergy account."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/sign-up"
            className="font-semibold text-[var(--color-brand)]"
          >
            Create one
          </Link>
        </>
      }
    >
      {linkError && (
        <p role="alert" className="mb-4 rounded-xl bg-[var(--color-gold)]/40 px-4 py-3 text-sm text-[var(--color-ink)]">
          {linkError}
        </p>
      )}
      <SignInForm redirectTo={redirectTo ?? "/dashboard"} />
    </AuthShell>
  );
}
