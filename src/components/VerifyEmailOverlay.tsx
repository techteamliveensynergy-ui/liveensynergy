import { VerifyEmailBannerForm } from "./VerifyEmailBannerForm";

/**
 * Covers the dashboard until the account opens the link in its welcome email
 * (0074). Rendered by the dashboard layout *instead of* the page, so nothing
 * behind it is even fetched; the sidebar under the backdrop can't be clicked.
 * The middleware sends every other dashboard URL back here.
 */
export function VerifyEmailOverlay({ email }: { email: string }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-email-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[var(--color-ink)]/40 p-4 backdrop-blur-sm"
    >
      <div className="card w-full max-w-lg p-6 sm:p-8">
        <p className="text-3xl" aria-hidden>
          ✉️
        </p>
        <h1 id="verify-email-title" className="mt-2 font-display text-xl font-bold text-[var(--color-ink)]">
          Confirm your email to continue
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          We&apos;ve sent a welcome email to <strong className="break-all text-[var(--color-ink)]">{email}</strong>.
          Open the link in it to confirm the address is yours — it brings you straight back here, with everything
          unlocked.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-ink-soft)]">
          <li>Can&apos;t see it? Check your spam or promotions folder.</li>
          <li>The link lasts 24 hours. If it has expired, send a new one below — only the newest link works.</li>
        </ul>
        <div className="mt-5">
          <VerifyEmailBannerForm />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4 text-sm">
          <span className="text-[var(--color-ink-soft)]">Wrong address? Sign out and create the account again.</span>
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="btn btn-ghost text-sm">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
