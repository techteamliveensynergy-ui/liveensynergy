import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { SignInForm } from "./SignInForm";

export const metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

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
      <SignInForm redirectTo={redirectTo ?? "/dashboard"} />
    </AuthShell>
  );
}
