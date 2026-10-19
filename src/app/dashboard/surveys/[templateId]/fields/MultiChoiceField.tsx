"use client";

import type { FieldProps } from "./types";
import { OptionRow } from "./OptionRow";
import { OtherInput } from "./OtherInput";
import { offersOther, otherLabel, SURVEY_OTHER_VALUE } from "@/lib/surveys";

export function MultiChoiceField({ question, value, onChange, otherText = "", onOtherTextChange }: FieldProps) {
  const options = question.options ?? [];
  const selected = Array.isArray(value) ? value : [];
  const other = offersOther(question);
  const otherChosen = other && selected.includes(SURVEY_OTHER_VALUE);
  const otherBox = otherChosen && onOtherTextChange && (
    <OtherInput label={otherLabel(question.config)} value={otherText} onChange={onOtherTextChange} />
  );

  function toggle(v: string, checked: boolean) {
    onChange(checked ? [...selected, v] : selected.filter((x) => x !== v));
  }

  const hasImages = options.some((o) => o.image_url);

  if (hasImages) {
    return (
      <>
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
                  className={`aspect-square w-full rounded-lg bg-[var(--color-mist)] object-contain transition-transform ${
                    checked ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
                  }`}
                />
              ) : (
                <div
                  className={`flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--color-mist)] text-[0.75em] text-[var(--color-ink-soft)] transition-transform ${
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
        {other && (
          <label className="flex flex-col gap-1.5">
            <input
              type="checkbox"
              className="sr-only"
              checked={otherChosen}
              onChange={(e) => toggle(SURVEY_OTHER_VALUE, e.target.checked)}
            />
            <div
              className={`flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--color-mist)] text-[1.5em] text-[var(--color-ink-soft)] transition-transform ${
                otherChosen ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
              }`}
              aria-hidden
            >
              …
            </div>
            <span className="text-center leading-tight">{otherLabel(question.config)}</span>
          </label>
        )}
      </div>
      {otherBox}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <OptionRow
          key={o.value}
          type="checkbox"
          index={i}
          label={o.label}
          checked={selected.includes(o.value)}
          onToggle={(checked) => toggle(o.value, checked)}
        />
      ))}
      {other && (
        <OptionRow
          type="checkbox"
          index={options.length}
          label={otherLabel(question.config)}
          checked={otherChosen}
          onToggle={(checked) => toggle(SURVEY_OTHER_VALUE, checked)}
        />
      )}
      {otherBox}
    </div>
  );
}
