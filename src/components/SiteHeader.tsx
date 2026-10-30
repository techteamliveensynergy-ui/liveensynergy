import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteWordmark } from "./SiteWordmark";
import { MobileNav } from "./MobileNav";

const NAV = [
  { href: "/brands", label: "For brands" },
  { href: "/events", label: "Events" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/** Public site header with auth-aware CTAs (dark theme, #82). */
export async function SiteHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-les-line)] bg-[var(--color-les-ink)]/90 backdrop-blur">
      <div className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-5 py-4 md:px-10">
        <SiteWordmark />
        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] text-[var(--color-les-muted)] transition-colors hover:text-[var(--color-les-lime)]"
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
              {/* Wrapped: `.btn` is unlayered and would beat `hidden`. */}
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
          <MobileNav items={user ? NAV : [...NAV, { href: "/auth/sign-in", label: "Sign in" }]} />
        </div>
      </div>
    </header>
  );
}
