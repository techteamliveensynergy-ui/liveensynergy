import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "./SignUpForm";

export const metadata = { title: "Create your account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join the sponsorship ecosystem where everyone wins."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href="/auth/sign-in"
            className="font-semibold text-[var(--color-brand)]"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm initialRole={role} />
    </AuthShell>
  );
}
