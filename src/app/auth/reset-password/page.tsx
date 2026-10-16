import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "Set a new password" };

/** Also the first stop for a survey sign-up once its email is confirmed
 *  (?welcome=1, /auth/verify-email) — it has never chosen a password. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const welcome = (await searchParams).welcome === "1";
  return (
    <AuthShell
      title={welcome ? "Email confirmed — choose a password" : "Set a new password"}
      subtitle={
        welcome
          ? "Thanks for confirming. Pick a password so you can sign in again next time."
          : "Choose a new password for your account."
      }
      footer={
        welcome ? (
          <>
            Rather do this later?{" "}
            <Link href="/dashboard" className="font-semibold text-[var(--color-brand)]">
              Go to your dashboard
            </Link>
          </>
        ) : (
          <>
            Changed your mind?{" "}
            <Link href="/auth/sign-in" className="font-semibold text-[var(--color-brand)]">
              Back to sign in
            </Link>
          </>
        )
      }
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
