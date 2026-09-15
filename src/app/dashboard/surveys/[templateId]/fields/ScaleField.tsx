"use client";

import type { FieldProps } from "./types";

export function ScaleField({ question, value, onChange }: FieldProps) {
  const min = question.config.min ?? 1;
  const max = question.config.max ?? 5;
  const rawStep = question.config.step ?? 1;
  // A step that doesn't divide the range evenly used to silently truncate
  // the scale (min=1, max=10, step=5 -> only points [1, 6]) instead of the
  // full scale an admin asked for — fall back to 1 rather than produce a
  // sparse, confusing set of points.
  const step = rawStep > 0 && (max - min) % rawStep === 0 ? rawStep : 1;
  const points: number[] = [];
  for (let v = min; v <= max; v += step) points.push(v);

  return (
    <div className="flex flex-wrap items-start gap-2">
      {points.map((pt, i) => {
        const isFirst = i === 0;
        const isLast = i === points.length - 1;
        const label = isFirst ? question.config.min_label : isLast ? question.config.max_label : undefined;
        return (
          <label key={pt} className="flex w-14 flex-col items-center gap-1 text-sm">
            <input
              type="radio"
              name={question.id}
              className="sr-only"
              checked={value === pt}
              onChange={() => onChange(pt)}
            />
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-lg font-semibold transition-colors ${
                value === pt
                  ? "bg-[var(--color-brand)] text-white"
                  : "bg-[var(--color-mist)] text-[var(--color-ink)] hover:bg-[var(--color-mist)]/70"
              }`}
            >
              {pt}
            </span>
            {/* Anchored directly under its own point rather than in a
                detached row below the whole scale, so the label always
                sits next to the value it describes even once the points
                wrap onto a second line on a narrow screen. */}
            {label && (
              <span className="text-center text-[11px] leading-tight text-[var(--color-ink-soft)]">
                {label}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
