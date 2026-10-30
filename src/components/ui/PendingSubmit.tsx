"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button for a server-component <form action={fn}> that shows it's
 * working and can't be pressed twice while the action runs (QA 30 Oct #3).
 */
export function PendingSubmit({
  label,
  pendingLabel = "Working…",
  className = "btn btn-primary",
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
