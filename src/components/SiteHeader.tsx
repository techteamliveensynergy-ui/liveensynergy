import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "./ui/Logo";

const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/events", label: "Events" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/** Public site header with auth-aware CTAs. */
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-50 border-b border-black/5 bg-[var(--color-mist)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:bg-black/[0.04]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard" className="btn btn-primary">
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/sign-in" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href="/auth/sign-up" className="btn btn-primary">
                Join us
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
