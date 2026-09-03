"use client";

import type { FieldProps } from "./types";

export function ScaleField({ question, value, onChange }: FieldProps) {
  const min = question.config.min ?? 1;
  const max = question.config.max ?? 5;
  const step = question.config.step ?? 1;
  const points: number[] = [];
  for (let v = min; v <= max; v += step) points.push(v);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        {points.map((pt) => (
          <label key={pt} className="flex flex-col items-center gap-1 text-sm">
            <input
              type="radio"
              name={question.id}
              className="h-4 w-4"
              checked={value === pt}
              onChange={() => onChange(pt)}
            />
            {pt}
          </label>
        ))}
      </div>
      {(question.config.min_label || question.config.max_label) && (
        <div className="mt-1 flex justify-between text-xs text-[var(--color-ink-soft)]">
          <span>{question.config.min_label}</span>
          <span>{question.config.max_label}</span>
        </div>
      )}
    </div>
  );
}
