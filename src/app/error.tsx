"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catch-all boundary for the app. Without one, any uncaught error — including a
 * Server Action that fails before it can return `{ error }`, such as a request
 * rejected at the body-size limit — falls through to Next's built-in
 * "Application error: a client-side exception has occurred" screen, which tells
 * the user nothing and offers no way back.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces in the browser console and in Vercel's runtime logs.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-16">
      <div className="card">
        <h1 className="text-xl font-semibold text-[var(--color-ink)]">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          That didn&apos;t save. Nothing has been lost — try again, and if it
          keeps happening let us know what you were doing.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
            Reference: <code>{error.digest}</code>
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn btn-primary">
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-ghost">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
