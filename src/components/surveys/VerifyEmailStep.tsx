"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { resendVerification, type AuthState } from "@/app/auth/actions";
import {
  changeUnverifiedEmail,
  checkEmailVerified,
  type ChangeEmailState,
} from "@/app/survey/[templateId]/actions";
import { VERIFY_POLL_MS } from "@/lib/survey-verify";

function PendingButton({ label, pending, className }: { label: string; pending: string; className: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={isPending}>
      {isPending ? pending : label}
    </button>
  );
}

/**
 * "Confirm your email to start" — shown before the first question when the
 * respondent's address isn't verified yet (client test, 4 Nov; migration 0108).
 *
 * Verifying BEFORE answering is deliberate: nothing has been typed yet, so a
 * respondent who leaves to open the email (often on their phone) loses nothing,
 * and no server-side draft is needed. The step watches for the confirmation —
 * the link may be opened in another tab or on another device — and carries on by
 * itself; "I've confirmed it" is the manual fallback.
 *
 * Also offers "Send it again" (rate-limited server-side) and "Wrong address?",
 * because a mistyped address otherwise traps the respondent: they can't verify
 * it, and their phone number is already on the account so they can't simply
 * start over.
 */
export function VerifyEmailStep({
  email,
  onVerified,
  onEmailChanged,
}: {
  email: string;
  onVerified: () => void;
  onEmailChanged: (email: string) => void;
}) {
  const [resendState, resendAction] = useActionState<AuthState, FormData>(resendVerification, {});
  const [changeState, changeAction] = useActionState<ChangeEmailState, FormData>(changeUnverifiedEmail, {});
  const [changing, setChanging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notYet, setNotYet] = useState(false);

  // Latest callbacks without restarting the watcher on every render.
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  const onEmailChangedRef = useRef(onEmailChanged);
  onEmailChangedRef.current = onEmailChanged;

  // Watch for the confirmation: on a timer while the tab is visible, and the
  // moment the respondent comes back to it.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || document.hidden) return;
      try {
        if (await checkEmailVerified()) {
          stopped = true;
          onVerifiedRef.current();
        }
      } catch {
        // A failed check just means "not yet"; the next tick asks again.
      }
    };
    const timer = setInterval(check, VERIFY_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  // A corrected address: the form keeps its own copy for the response record.
  useEffect(() => {
    if (changeState.email) {
      onEmailChangedRef.current(changeState.email);
      if (!changeState.error) setChanging(false);
    }
  }, [changeState]);

  async function manualCheck() {
    setChecking(true);
    setNotYet(false);
    try {
      if (await checkEmailVerified()) {
        onVerifiedRef.current();
        return;
      }
      setNotYet(true);
    } catch {
      setNotYet(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="card space-y-4 p-5" data-testid="verify-email-step">
      <h2 className="text-sm font-semibold text-[var(--color-ink)]">Confirm your email to start</h2>
      <p className="text-sm text-[var(--color-ink-soft)]">
        We&apos;ve sent a link to <strong className="break-all text-[var(--color-ink)]">{email}</strong>. Open it to
        confirm the address is yours, then come back to this page — the survey starts by itself. We need a real
        address because your discount code is sent there.
      </p>

      <div role="status" aria-live="polite" className="space-y-1 text-sm">
        {notYet && (
          <p className="text-[var(--color-accent)]">
            We can&apos;t see the confirmation yet. Open the link in the email first, then try again.
          </p>
        )}
        {resendState.message && <p className="font-medium text-[var(--color-olive-deep)]">{resendState.message}</p>}
        {resendState.error && <p className="text-[var(--color-accent)]">{resendState.error}</p>}
        {changeState.message && <p className="font-medium text-[var(--color-olive-deep)]">{changeState.message}</p>}
        {changeState.error && <p className="text-[var(--color-accent)]">{changeState.error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={manualCheck} disabled={checking}>
          {checking ? "Checking…" : "I've confirmed it"}
        </button>
        <form action={resendAction}>
          <PendingButton label="Send it again" pending="Sending…" className="btn btn-ghost" />
        </form>
        {!changing && (
          <button type="button" className="text-sm font-medium underline" onClick={() => setChanging(true)}>
            Wrong address?
          </button>
        )}
      </div>

      {changing && (
        <form action={changeAction} className="space-y-2 rounded-xl bg-[var(--color-mist)] p-4">
          <label htmlFor="verify_new_email" className="block text-sm font-medium text-[var(--color-ink)]">
            Your correct email address
          </label>
          <input
            id="verify_new_email"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={email}
            className="input"
          />
          <div className="flex flex-wrap items-center gap-3">
            <PendingButton label="Update and resend" pending="Updating…" className="btn btn-primary" />
            <button type="button" className="text-sm font-medium underline" onClick={() => setChanging(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
