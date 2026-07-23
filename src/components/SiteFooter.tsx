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
    <footer className="bg-[var(--color-ink)] text-[#fcf7f0]">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-sm text-white/60">
            Turning sponsorship into something everyone actually wins — for
            brands, artists and the audiences who show up.
          </p>
        </div>
        {LINKS.map((col) => (
          <div key={col.heading}>
            <h4 className="font-display text-sm font-semibold text-white">
              {col.heading}
            </h4>
            <ul className="mt-3 space-y-2">
              {col.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-white/60 hover:text-[var(--color-brand-soft)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-white/40">
          © {new Date().getFullYear()} Live·En·Synergy. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
