import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "./ui/Logo";
import { MobileNav } from "./MobileNav";

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
    <header className="sticky top-0 z-50 border-b border-black/10 bg-[var(--color-mist)]/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
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
              {/* Wrapped rather than putting `hidden sm:block` on the link
                  itself: `.btn` is an unlayered rule in globals.css, so it
                  beats Tailwind's layered utilities and `hidden` would be
                  silently ignored on any element carrying `.btn`. */}
              <span className="hidden sm:block">
                <Link href="/auth/sign-in" className="btn btn-ghost">
                  Sign in
                </Link>
              </span>
              <Link href="/auth/sign-up" className="btn btn-primary">
                Join us
              </Link>
            </>
          )}
          <MobileNav
            items={
              user
                ? NAV
                : [...NAV, { href: "/auth/sign-in", label: "Sign in" }]
            }
          />
        </div>
      </div>
    </header>
  );
}
