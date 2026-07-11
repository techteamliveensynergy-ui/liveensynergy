import Link from "next/link";
import { Logo } from "./ui/Logo";

const LINKS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Platform",
    items: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/events", label: "Browse events" },
      { href: "/auth/sign-up", label: "Get started" },
    ],
  },
  {
    heading: "Company",
    items: [
      { href: "/about", label: "About us" },
      { href: "/contact", label: "Contact" },
      { href: "/faqs", label: "FAQs" },
    ],
  },
  {
    heading: "Legal",
    items: [
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-black/5 bg-[var(--color-mist)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-[var(--color-ink-soft)]">
            A performance-based sponsorship ecosystem for live events — where
            brands, artists and audiences all win.
          </p>
        </div>
        {LINKS.map((col) => (
          <div key={col.heading}>
            <h4 className="text-sm font-semibold text-[var(--color-ink)]">
              {col.heading}
            </h4>
            <ul className="mt-3 space-y-2">
              {col.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-brand)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-black/5">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-[var(--color-ink-soft)]">
          © {new Date().getFullYear()} Live-En-Synergy. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
