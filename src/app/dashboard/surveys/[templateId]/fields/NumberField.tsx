"use client";

import type { FieldProps } from "./types";

export function NumberField({ question, value, onChange }: FieldProps) {
  return (
    <input
      type="number"
      className="input"
      min={question.config.min}
      max={question.config.max}
      step={question.config.step ?? 1}
      value={typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}
