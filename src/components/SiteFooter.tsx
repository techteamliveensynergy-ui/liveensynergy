import Link from "next/link";
import { SiteWordmark } from "./SiteWordmark";

const LINKS: { heading: string; items: { href: string; label: string }[] }[] = [
  {
    heading: "Platform",
    items: [
      { href: "/brands", label: "For brands" },
      { href: "/events", label: "Browse events" },
      { href: "/#how-it-works", label: "How it works" },
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
      { href: "/cookies", label: "Cookie Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-les-line)] bg-[var(--color-les-ink)]">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10">
        <div>
          <SiteWordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--color-les-muted)]">
            More engagement. More experiences. More live events — for brands, artists and the audiences who
            show up.
          </p>
        </div>
        {LINKS.map((col) => (
          <div key={col.heading}>
            <h4 className="les-eyebrow">{col.heading}</h4>
            <ul className="mt-4 space-y-2">
              {col.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-[var(--color-les-muted)] transition-colors hover:text-[var(--color-les-lime)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--color-les-line)]">
        <p className="mx-auto max-w-[1200px] px-5 py-5 text-xs text-[var(--color-les-muted)]/70 md:px-10">
          © {new Date().getFullYear()} Live En Synergy. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
