"use client";

import { useRef } from "react";

/**
 * A submit button that first shows what will happen and asks the admin to
 * confirm (client request, 13 Oct: changing a campaign's status should spell
 * out its effects, given where the campaign is now). Checks the form's own
 * required fields first, so the popup never opens over an incomplete form.
 * Native <dialog>: focus is trapped and Esc cancels.
 */
export function ConfirmSubmitButton({
  label,
  className,
  title,
  points,
  warnings = [],
  confirmLabel,
  danger = false,
}: {
  label: string;
  className?: string;
  title: string;
  /** What will happen, in order. */
  points: string[];
  /** Things the admin is overriding or should double-check — shown first. */
  warnings?: string[];
  confirmLabel: string;
  danger?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  function open() {
    const form = buttonRef.current?.closest("form");
    if (!form || !form.reportValidity()) return;
    dialogRef.current?.showModal();
  }

  function confirm() {
    dialogRef.current?.close();
    buttonRef.current?.closest("form")?.requestSubmit();
  }

  return (
    <>
      <button ref={buttonRef} type="button" className={className} onClick={open}>
        {label}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl bg-white p-0 text-[var(--color-ink)] shadow-xl backdrop:bg-black/40"
      >
        <div className="p-6">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-xl bg-[var(--color-gold)]/50 px-4 py-3 text-sm">
              {warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <span aria-hidden>⚠️</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm font-semibold">This will:</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
            <button type="button" className={`btn text-sm ${danger ? "btn-dark" : "btn-primary"}`} onClick={confirm}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
