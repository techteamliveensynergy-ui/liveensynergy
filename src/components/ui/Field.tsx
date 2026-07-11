import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}

/** Label + optional hint wrapper for a form control. */
export function Field({ label, htmlFor, required, hint, children }: FieldProps) {
  return (
    <div>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="text-[var(--color-accent)]"> *</span>}
      </label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}
