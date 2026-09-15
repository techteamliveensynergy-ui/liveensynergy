"use client";

import type { FieldProps } from "./types";

/** Fixed by position, not by option value/label — a Likert question's icons
 *  never change even when an admin edits the option text they sit under. */
const LIKERT_STYLE: readonly { emoji: string; bg: string }[] = [
  { emoji: "😠", bg: "#f2a35c" },
  { emoji: "🙁", bg: "#f6c98a" },
  { emoji: "😐", bg: "#f3c9dd" },
  { emoji: "🙂", bg: "#d8c4f2" },
  { emoji: "😄", bg: "#9fd8ad" },
];

/** single_choice, attention_check, yes_no — all a plain radio group, unless
 *  this single_choice question came from the "Likert (5-point)" palette
 *  preset (config.display_style === "likert"), which renders as five
 *  face-icon tiles instead. */
export function ChoiceField({ question, value, onChange }: FieldProps) {
  const options = question.options ?? [];

  if (question.config.display_style === "likert" && options.length === LIKERT_STYLE.length) {
    return (
      <div className="grid grid-cols-5 gap-2 text-center">
        {options.map((o, i) => {
          const style = LIKERT_STYLE[i];
          const selected = value === o.value;
          return (
            <label key={o.value} className="flex flex-col items-center gap-1.5 text-xs">
              <input
                type="radio"
                name={question.id}
                className="sr-only"
                checked={selected}
                onChange={() => onChange(o.value)}
              />
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-xl text-2xl transition-transform ${
                  selected ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
                }`}
                style={{ background: style.bg }}
                aria-hidden
              >
                {style.emoji}
              </span>
              <span className="leading-tight text-[var(--color-ink-soft)]">{o.label}</span>
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
            type="radio"
            name={question.id}
            className="h-4 w-4"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
