import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export const metadata = { title: "Account blocked" };

export default function BlockedPage() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--color-mist)] p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-8">
          <div className="text-4xl" aria-hidden>
            🔒
          </div>
          <h1 className="mt-3 font-display text-xl font-semibold text-[var(--color-ink)]">
            Account blocked
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
            Your access to Live·En·Synergy has been suspended, so you&apos;ve
            been signed out. If you think this is a mistake, get in touch and
            our team will take another look.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="btn btn-primary">
              Contact the team
            </Link>
            <Link href="/" className="btn btn-ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
