import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { ResendConfirmationForm } from "./ResendConfirmationForm";

export const metadata = { title: "Confirm your email" };

/**
 * Where sign-up lands while the account waits for its email to be confirmed
 * (client, 13 Oct: "there is no way for the user to know the email has been
 * sent"). Every account must confirm its address before it can sign in — all
 * platform communication is by email — and the link in the email signs the
 * person in and takes them straight to setting up their profile.
 */
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const address = email?.trim() || null;

  return (
    <AuthShell
      title="Check your inbox"
      subtitle="One last step: confirm your email address."
      footer={
        <>
          Already confirmed?{" "}
          <Link href="/auth/sign-in" className="font-semibold text-[var(--color-brand)]">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl bg-[var(--color-sage)] px-5 py-4 text-[var(--color-olive-deep)]">
          <p className="text-2xl" aria-hidden>
            ✉️
          </p>
          <p className="mt-1 font-semibold">We&apos;ve sent you a confirmation email</p>
          <p className="mt-1 text-sm">
            {address ? (
              <>
                It&apos;s on its way to <strong className="break-all">{address}</strong>.
              </>
            ) : (
              "It's on its way to the address you signed up with."
            )}{" "}
            Click the confirmation button in that email and you&apos;ll be signed in and taken straight to
            setting up your profile.
          </p>
        </div>

        <ol className="space-y-2 text-sm text-[var(--color-ink-soft)]">
          <li>1. Open the email from Live·En·Synergy (it can take a minute or two).</li>
          <li>2. Click the confirmation link — ideally on this device and browser.</li>
          <li>3. Finish your profile, and you&apos;re in.</li>
        </ol>

        <div className="rounded-xl border border-black/10 p-4 text-sm">
          <p className="font-semibold text-[var(--color-ink)]">Can&apos;t find it?</p>
          <p className="mt-1 text-[var(--color-ink-soft)]">
            Check your spam or promotions folder. The link expires after 24 hours.
          </p>
          {address && (
            <div className="mt-3">
              <ResendConfirmationForm email={address} />
            </div>
          )}
          <p className="mt-3 text-[var(--color-ink-soft)]">
            Wrong address?{" "}
            <Link href="/auth/sign-up" className="font-semibold text-[var(--color-brand)]">
              Sign up again
            </Link>{" "}
            with the right one.
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
