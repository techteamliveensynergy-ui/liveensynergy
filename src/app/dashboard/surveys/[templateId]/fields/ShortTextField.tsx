"use client";

import type { FieldProps } from "./types";

export function ShortTextField({ question, value, onChange }: FieldProps) {
  return (
    <input
      className="input"
      maxLength={question.config.max_length}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
