"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that asks first.
 *
 * Used wherever a save is destructive or irreversible — agreeing to a
 * sponsorship (which can't be undone), overwriting someone's profile from the
 * admin console, editing a deal a user has already picked. The 3 Aug standup
 * asked for a confirmation on each of those rather than a single click.
 *
 * Deliberately renders no `type="submit"` control: with one, pressing Enter in
 * any text field would submit the form and skip the confirmation entirely.
 * The dialog calls `requestSubmit()` on the parent form instead, which still
 * runs validation and the server action normally.
 */
export function ConfirmSubmit({
  label,
  pendingLabel = "Saving…",
  title,
  body,
  confirmLabel = "Yes, save changes",
  cancelLabel = "Go back",
  className = "btn btn-primary",
  danger = false,
}: {
  label: string;
  pendingLabel?: string;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
  /** Tints the confirm action, for anything that can't be reversed. */
  danger?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const { pending } = useFormStatus();

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={(e) => {
          formRef.current = e.currentTarget.form;
          setOpen(true);
        }}
      >
        {pending ? pendingLabel : label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="card w-full max-w-md p-6 text-left">
            <h2 className="font-display text-lg font-semibold text-[var(--color-ink)]">
              {title}
            </h2>
            <div className="mt-2 text-sm text-[var(--color-ink-soft)]">
              {body}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className={
                  danger
                    ? "btn btn-dark"
                    : "btn btn-primary"
                }
                onClick={() => {
                  setOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
