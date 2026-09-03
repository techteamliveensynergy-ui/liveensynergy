"use client";

import type { FieldProps } from "./types";

export function MultiChoiceField({ question, value, onChange }: FieldProps) {
  const options = question.options ?? [];
  const selected = Array.isArray(value) ? value : [];

  function toggle(v: string, checked: boolean) {
    onChange(checked ? [...selected, v] : selected.filter((x) => x !== v));
  }

  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={selected.includes(o.value)}
            onChange={(e) => toggle(o.value, e.target.checked)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
