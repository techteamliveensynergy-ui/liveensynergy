"use client";

import type { FieldProps } from "./types";

/** single_choice, attention_check, yes_no — all a plain radio group. */
export function ChoiceField({ question, value, onChange }: FieldProps) {
  const options = question.options ?? [];
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2">
          <input
            type="radio"
            name={question.id}
            className="h-4 w-4"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
