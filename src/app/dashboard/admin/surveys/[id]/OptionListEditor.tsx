"use client";

import type { SurveyQuestionOption } from "@/lib/types";

function slugify(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `option_${index + 1}`;
}

/**
 * Deliberately move-button reordering rather than its own drag-and-drop —
 * the ask this slice builds is reordering *questions* on the canvas; a
 * second nested drag surface for options is a fine follow-up, not required
 * to get the builder usable.
 */
export function OptionListEditor({
  options,
  editable,
  onChange,
}: {
  options: SurveyQuestionOption[];
  editable: boolean;
  onChange: (options: SurveyQuestionOption[]) => void;
}) {
  function updateLabel(index: number, label: string) {
    onChange(
      options.map((o, i) => (i === index ? { label, value: slugify(label, i) } : o)),
    );
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }
  function add() {
    const index = options.length;
    onChange([...options, { label: `Option ${index + 1}`, value: `option_${index + 1}` }]);
  }

  return (
    <div>
      <label className="field-label">Options</label>
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              className="input min-w-0 flex-1"
              disabled={!editable}
              value={option.label}
              onChange={(e) => updateLabel(index, e.target.value)}
            />
            {editable && (
              <>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 text-xs text-[var(--color-ink-soft)] hover:bg-black/5"
                  aria-label="Move option up"
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 text-xs text-[var(--color-ink-soft)] hover:bg-black/5"
                  aria-label="Move option down"
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/10 text-xs text-[var(--color-ink-soft)] hover:bg-black/5"
                  aria-label="Remove option"
                  onClick={() => remove(index)}
                >
                  ✕
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <button type="button" className="btn btn-ghost mt-2 text-sm" onClick={add}>
          + Add option
        </button>
      )}
    </div>
  );
}
