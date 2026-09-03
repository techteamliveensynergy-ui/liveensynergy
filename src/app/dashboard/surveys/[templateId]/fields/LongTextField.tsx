"use client";

import type { FieldProps } from "./types";

export function LongTextField({ question, value, onChange }: FieldProps) {
  return (
    <textarea
      className="textarea"
      maxLength={question.config.max_length}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
