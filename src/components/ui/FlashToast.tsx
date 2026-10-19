"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * A floating confirmation pinned to the top of the screen for a few seconds
 * after an action redirects back to a page (19 Oct: a brand enquiring from
 * Discover saw nothing happen — an inline banner sat above the fold while
 * they were scrolled down to the card they'd clicked).
 *
 * The server page renders it when the action's flag is in the URL; on mount
 * it strips `clearParams` with history.replaceState (no server round-trip, so
 * it stays mounted) so a refresh or a shared link doesn't show it again.
 */
export function FlashToast({
  title,
  detail,
  link,
  clearParams,
  durationMs = 5000,
}: {
  title: string;
  detail?: string;
  link?: { href: string; label: string };
  clearParams: string[];
  durationMs?: number;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    clearParams.forEach((p) => url.searchParams.delete(p));
    window.history.replaceState(window.history.state, "", url);
    const timer = window.setTimeout(() => setVisible(false), durationMs);
    return () => window.clearTimeout(timer);
    // Once per mount — the params are only read the first time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-4 z-[60] flex justify-center px-4 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-4 opacity-0"
      }`}
    >
      <div className="flex w-full max-w-md items-start gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm shadow-[0_12px_32px_-12px_rgba(44,36,34,0.35)]">
        <span
          aria-hidden
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--color-sage)] text-xs font-bold text-[var(--color-olive-deep)]"
        >
          ✓
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--color-ink)]">{title}</p>
          {detail && <p className="mt-0.5 text-[var(--color-ink-soft)]">{detail}</p>}
          {link && (
            <Link
              href={link.href}
              className="mt-1 inline-block font-semibold text-[var(--color-brand-dark)] hover:underline"
            >
              {link.label}
            </Link>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setVisible(false)}
          className="shrink-0 px-1 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>
    </div>
  );
}
