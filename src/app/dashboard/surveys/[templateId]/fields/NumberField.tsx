"use client";

import type { CSSProperties } from "react";
import type { FieldProps } from "./types";

export function NumberField({ question, value, onChange }: FieldProps) {
  const min = question.config.min ?? 0;
  const max = question.config.max ?? 100;
  const step = question.config.step ?? 1;
  const hasValue = typeof value === "number";
  // The slider needs a real position even before the respondent has touched
  // it — start the handle (and the exact-value box below) at the low end
  // rather than snapping to it on first drag.
  const current = hasValue ? value : min;
  const progress = max > min ? ((current - min) / (max - min)) * 100 : 0;

  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        className="range-slider"
        min={min}
        max={max}
        step={step}
        value={current}
        style={{ ["--range-progress" as string]: `${progress}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        type="number"
        className="input w-20 shrink-0 text-right"
        min={min}
        max={max}
        step={step}
        value={hasValue ? value : ""}
        placeholder={String(min)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </div>
  );
}
