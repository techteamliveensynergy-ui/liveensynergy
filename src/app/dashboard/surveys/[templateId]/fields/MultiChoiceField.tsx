"use client";

import type { FieldProps } from "./types";

export function MultiChoiceField({ question, value, onChange }: FieldProps) {
  const options = question.options ?? [];
  const selected = Array.isArray(value) ? value : [];

  function toggle(v: string, checked: boolean) {
    onChange(checked ? [...selected, v] : selected.filter((x) => x !== v));
  }

  const hasImages = options.some((o) => o.image_url);

  if (hasImages) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const checked = selected.includes(o.value);
          return (
            <label key={o.value} className="flex flex-col gap-1.5">
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={(e) => toggle(o.value, e.target.checked)}
              />
              {o.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.image_url}
                  alt=""
                  className={`aspect-square w-full rounded-xl object-cover transition-transform ${
                    checked ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
                  }`}
                />
              ) : (
                <div
                  className={`flex aspect-square w-full items-center justify-center rounded-xl bg-[var(--color-mist)] text-[0.75em] text-[var(--color-ink-soft)] transition-transform ${
                    checked ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
                  }`}
                  aria-hidden
                >
                  No image
                </div>
              )}
              <span className="text-center leading-tight">{o.label}</span>
            </label>
          );
        })}
      </div>
    );
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
