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
        className="grid h-10 w-10 place-items-center rounded-full border border-black/10 bg-white text-lg text-[var(--color-ink)] transition hover:bg-[var(--color-mist)]"
      >
        <span aria-hidden>{open ? "✕" : "☰"}</span>
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-full border-b border-black/10 bg-[var(--color-mist)] shadow-[0_8px_16px_-8px_rgba(44,36,34,0.2)]"
        >
          <nav className="mx-auto flex max-w-6xl flex-col px-5 py-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-medium text-[var(--color-ink)] transition hover:bg-black/[0.04]"
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
