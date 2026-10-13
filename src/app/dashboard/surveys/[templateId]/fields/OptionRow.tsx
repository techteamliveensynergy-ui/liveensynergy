"use client";

/** A–Z key shown on a choice row; past 26 options it falls back to a number. */
export function optionKey(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
}

/**
 * One choice as a bordered, clickable row with a letter key (Typeform-style,
 * 13 Oct client notes). The native radio/checkbox stays inside the label —
 * visually hidden but still focusable and keyboard-operable; globals.css
 * `.survey-option` draws the focus ring and the selected state on the row.
 */
export function OptionRow({
  type,
  name,
  index,
  label,
  checked,
  onToggle,
}: {
  type: "radio" | "checkbox";
  name?: string;
  index: number;
  label: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="survey-option" data-selected={checked}>
      <input
        type={type}
        name={name}
        className="sr-only"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="survey-option-key" aria-hidden>
        {optionKey(index)}
      </span>
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {checked && (
        <span aria-hidden className="shrink-0 font-bold text-[var(--color-brand)]">
          ✓
        </span>
      )}
    </label>
  );
}
