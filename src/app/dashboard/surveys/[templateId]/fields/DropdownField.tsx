"use client";

import type { FieldProps } from "./types";

export function DropdownField({ question, value, onChange }: FieldProps) {
  return (
    <select
      className="select"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Choose…</option>
      {(question.options ?? []).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
