import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { VerifyEmailBannerForm } from "@/components/VerifyEmailBannerForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Link expired" };

/**
 * Where a confirm-your-email link (0074) lands when it can't be used: past
 * its 24 hours, replaced by a newer email, or mangled by a mail client.
 * Signed in → resend on the spot; signed out → sign in, and the dashboard's
 * overlay has the same button.
 */
export default async function LinkExpiredPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthShell
      title={reason === "expired" ? "That link has expired" : "That link doesn't work"}
      subtitle={
        reason === "expired"
          ? "Confirmation links last 24 hours."
          : "It may have been replaced by a newer email, or copied only in part."
      }
      footer={
        <Link href="/" className="font-semibold text-[var(--color-brand)]">
          Back to the home page
        </Link>
      }
    >
      {user ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-ink-soft)]">
            We&apos;ll send a fresh link to <strong className="break-all text-[var(--color-ink)]">{user.email}</strong>.
            Only the newest email&apos;s link works.
          </p>
          <VerifyEmailBannerForm />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Sign in and press <strong>Send it again</strong> on your dashboard to get a new link.
          </p>
          <Link href="/auth/sign-in?redirectTo=/dashboard" className="btn btn-primary w-full">
            Sign in
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
