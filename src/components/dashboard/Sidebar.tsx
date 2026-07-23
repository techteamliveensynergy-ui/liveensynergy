"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import type { NavItem } from "@/lib/dashboard-nav";

interface SidebarProps {
  nav: NavItem[];
  roleLabel: string;
  userName: string;
  userEmail: string;
  workspaceName?: string;
  workspaceSubtitle?: string;
}

/**
 * Responsive dashboard navigation. Fixed rail on desktop, slide-in drawer
 * with a hamburger toggle on mobile.
 */
export function Sidebar({
  nav,
  roleLabel,
  userName,
  userEmail,
  workspaceName,
  workspaceSubtitle,
}: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  const navList = (
    <nav className="flex-1 space-y-1 px-3">
      {nav.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
            isActive(item.href)
              ? "bg-[var(--color-brand)] text-white"
              : "text-[var(--color-ink-soft)] hover:bg-[var(--color-mist)]"
          }`}
        >
          <span aria-hidden>{item.icon}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );

  const account = (
    <div className="border-t border-black/10 p-4">
      <p className="truncate text-sm font-semibold">{userName}</p>
      <p className="truncate text-xs text-[var(--color-ink-soft)]">
        {userEmail}
      </p>
      <form action="/auth/sign-out" method="post" className="mt-3">
        <button type="submit" className="btn btn-ghost w-full text-sm">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-black/10 bg-white px-4 py-3 md:hidden">
        <Logo />
        <button
          type="button"
          aria-label="Toggle navigation"
          className="btn btn-ghost px-3 py-2"
          onClick={() => setOpen((v) => !v)}
        >
          ☰
        </button>
      </div>

      {/* Mobile drawer overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-black/10 bg-white shadow-[2px_0_12px_-6px_rgba(44,36,34,0.18)] transition-transform md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Logo />
        </div>
        <div className="px-5 pb-4">
          {workspaceName ? (
            <div className="flex items-center gap-2.5 rounded-2xl border border-black/10 bg-[var(--color-mist)] p-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--color-ink)] font-serif text-base italic text-white">
                {workspaceName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-[var(--color-ink)]">
                  {workspaceName}
                </p>
                <p className="truncate text-[11px] text-[var(--color-ink-soft)]">
                  {workspaceSubtitle || roleLabel}
                </p>
              </div>
            </div>
          ) : (
            <span className="chip">{roleLabel}</span>
          )}
        </div>
        {navList}
        {account}
      </aside>
    </>
  );
}
