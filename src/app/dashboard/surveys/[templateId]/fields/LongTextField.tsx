"use client";

import type { FieldProps } from "./types";

export function LongTextField({ question, value, onChange }: FieldProps) {
  return (
    <>
      <textarea
        className="textarea"
        maxLength={question.config.max_length}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* Free text is where contact details get typed by accident (#54);
          anything that slips through is masked in exports anyway. */}
      <p className="mt-1 text-[0.8em] text-[var(--color-ink-soft)]">
        Please don&apos;t include personal details such as phone numbers or email addresses.
      </p>
    </>
  );
}
