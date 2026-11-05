"use client";

import { useFormStatus } from "react-dom";
import { signInWithGoogle } from "@/app/auth/actions";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.99 23.99 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Inner({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-ghost flex w-full items-center justify-center gap-3"
      disabled={pending}
      data-testid="google-button"
    >
      <GoogleMark />
      {pending ? "Opening Google…" : label}
    </button>
  );
}

/**
 * "Continue with Google". Render it only when googleSignInEnabled() is true —
 * the page decides, so a deployment without the provider configured shows no
 * button rather than one that fails.
 *
 * `role` carries the sign-up card (or "audience" with `lockRole` from a survey);
 * `next` is where to land afterwards. Both are hints re-validated server-side.
 */
export function GoogleButton({
  next,
  role,
  lockRole = false,
  label = "Continue with Google",
}: {
  next?: string;
  role?: string;
  lockRole?: boolean;
  label?: string;
}) {
  return (
    <form action={signInWithGoogle}>
      {next && <input type="hidden" name="next" value={next} />}
      {role && <input type="hidden" name="role" value={role} />}
      {lockRole && <input type="hidden" name="locked" value="1" />}
      <Inner label={label} />
    </form>
  );
}

/** "or" rule between Google and the email form. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-[var(--color-ink-soft)]" role="separator">
      <span className="h-px flex-1 bg-black/10" />
      or
      <span className="h-px flex-1 bg-black/10" />
    </div>
  );
}
