"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Mobile disclosure for the public site nav.
 *
 * Without this the header's links are `hidden md:flex`, so on a phone the
 * whole public site (How it works / Events / About / Contact) is unreachable —
 * only the logo and the auth buttons render.
 */
export function MobileNav({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
        className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--color-les-line)] text-lg text-[var(--color-les-cream)] transition hover:border-[var(--color-les-lime)]"
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-full border-b border-[var(--color-les-line)] bg-[var(--color-les-ink)] shadow-[0_16px_32px_-12px_rgba(0,0,0,0.6)]"
        >
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-base text-[var(--color-les-cream)] transition hover:text-[var(--color-les-lime)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
