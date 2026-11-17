import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { peekAccessLink } from "@/lib/access-links";
import { continueWithLink } from "../actions";

export const metadata = { title: "Continue", robots: { index: false } };

/**
 * The page behind the link in our "reset your password" and "sign in" emails
 * (0122). The address is just /auth/link/<token> — nothing else in it. The
 * page only shows a button; pressing it redeems the link (so an email scanner
 * that merely opens it can't use it up).
 */
export default async function AccessLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await peekAccessLink(token);

  if (!link) {
    return (
      <AuthShell
        title="That link has expired"
        subtitle="Links work once and last about an hour."
        footer={
          <Link href="/auth/sign-in" className="font-semibold text-[var(--color-brand)]">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4 text-sm text-[var(--color-ink-soft)]">
          <p>It may have been used already, or it has run out of time. You can ask for a new one.</p>
          <Link href="/auth/forgot-password" className="btn btn-primary w-full">
            Email me a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  const reset = link.type === "recovery";
  return (
    <AuthShell
      title={reset ? "Reset your password" : "Sign in to Live·En·Synergy"}
      subtitle={
        reset
          ? "One more step: continue to choose a new password. You'll be signed in afterwards."
          : "Continue to sign in. You'll be taken straight back to where you were."
      }
      footer={
        <Link href="/auth/sign-in" className="font-semibold text-[var(--color-brand)]">
          Back to sign in
        </Link>
      }
    >
      <form action={continueWithLink} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn btn-primary w-full">
          {reset ? "Continue to reset password" : "Continue"}
        </button>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Didn&apos;t ask for this? You can close this page — nothing changes unless you press the button.
        </p>
      </form>
    </AuthShell>
  );
}
