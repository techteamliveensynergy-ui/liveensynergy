"use client";

import { useSearchParams } from "next/navigation";

/** "Your email is confirmed" — shown once, on the screen a confirmation link
 *  lands on (/auth/callback adds ?confirmed=1) — and why a page bounced an
 *  unverified account back to the dashboard (?verify=required, middleware). */
export function EmailConfirmedNotice() {
  const params = useSearchParams();
  if (params.get("verify") === "required") {
    return (
      <p role="alert" className="mb-5 rounded-xl bg-[var(--color-pink)] px-4 py-3 text-sm font-medium text-[var(--color-accent)]">
        That page opens once your email address is confirmed — see below.
      </p>
    );
  }
  if (!params.get("confirmed")) return null;
  return (
    <p
      role="status"
      className="mb-5 rounded-xl bg-[var(--color-sage)] px-4 py-3 text-sm font-medium text-[var(--color-olive-deep)]"
    >
      ✓ Your email address is confirmed — thanks! You&apos;re signed in.
    </p>
  );
}
