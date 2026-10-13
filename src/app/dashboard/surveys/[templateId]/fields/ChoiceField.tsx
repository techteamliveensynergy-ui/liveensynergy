"use client";

import type { FieldProps } from "./types";
import { OptionRow } from "./OptionRow";
import { OtherInput } from "./OtherInput";
import { offersOther, otherLabel, SURVEY_OTHER_VALUE } from "@/lib/surveys";

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
export function ChoiceField({ question, value, onChange, otherText = "", onOtherTextChange }: FieldProps) {
  const options = question.options ?? [];
  const other = offersOther(question);
  const otherChosen = other && value === SURVEY_OTHER_VALUE;
  const otherBox = otherChosen && onOtherTextChange && (
    <OtherInput label={otherLabel(question.config)} value={otherText} onChange={onOtherTextChange} />
  );
  const hasImages = options.some((o) => o.image_url);

  if (hasImages) {
    return (
      <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label key={o.value} className="flex flex-col gap-1.5">
              <input
                type="radio"
                name={question.id}
                className="sr-only"
                checked={selected}
                onChange={() => onChange(o.value)}
              />
              {o.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={o.image_url}
                  alt=""
                  className={`aspect-square w-full rounded-lg object-cover transition-transform ${
                    selected ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
                  }`}
                />
              ) : (
                <div
                  className={`flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--color-mist)] text-[0.75em] text-[var(--color-ink-soft)] transition-transform ${
                    selected ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
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
              type="radio"
              name={question.id}
              className="sr-only"
              checked={otherChosen}
              onChange={() => onChange(SURVEY_OTHER_VALUE)}
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

  if (question.config.display_style === "likert" && options.length === LIKERT_STYLE.length) {
    return (
      // Tiles size to the column rather than a fixed 56px each: five of them
      // plus gaps overflowed 320–375px phones (test MOB-02).
      <div className="grid min-w-0 grid-cols-5 gap-1 text-center sm:gap-2">
        {options.map((o, i) => {
          const style = LIKERT_STYLE[i];
          const selected = value === o.value;
          return (
            <label key={o.value} className="flex min-w-0 flex-col items-center gap-1.5 text-[0.75em]">
              <input
                type="radio"
                name={question.id}
                className="sr-only"
                checked={selected}
                onChange={() => onChange(o.value)}
              />
              <span
                className={`flex aspect-square w-full max-w-14 items-center justify-center rounded-xl text-[1.5em] transition-transform ${
                  selected ? "scale-105 ring-2 ring-[var(--color-ink)]" : ""
                }`}
                style={{ background: style.bg }}
                aria-hidden
              >
                {style.emoji}
              </span>
              <span className="w-full break-words leading-tight text-[var(--survey-body-color,var(--color-ink-soft))] [hyphens:auto]">{o.label}</span>
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {options.map((o, i) => (
        <OptionRow
          key={o.value}
          type="radio"
          name={question.id}
          index={i}
          label={o.label}
          checked={value === o.value}
          onToggle={() => onChange(o.value)}
        />
      ))}
      {other && (
        <OptionRow
          type="radio"
          name={question.id}
          index={options.length}
          label={otherLabel(question.config)}
          checked={otherChosen}
          onToggle={() => onChange(SURVEY_OTHER_VALUE)}
        />
      )}
      {otherBox}
    </div>
  );
}
