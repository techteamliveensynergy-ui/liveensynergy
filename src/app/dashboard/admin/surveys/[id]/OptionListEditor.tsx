"use client";

import { useState } from "react";
import type { SurveyQuestionOption } from "@/lib/types";
import { uploadQuestionOptionImage } from "../actions";

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
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function updateLabel(index: number, label: string) {
    onChange(
      // Spread the existing option first — a plain { label, value } here
      // used to silently drop every other key, which erased a just-uploaded
      // image_url the moment someone edited the label text after it.
      options.map((o, i) => (i === index ? { ...o, label, value: slugify(label, i) } : o)),
    );
  }
  async function handleOptionImage(index: number, file: File | undefined) {
    if (!file) return;
    setUploadingIndex(index);
    setUploadError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await uploadQuestionOptionImage(form);
    setUploadingIndex(null);
    if (result.error) {
      setUploadError(result.error);
      return;
    }
    onChange(options.map((o, i) => (i === index ? { ...o, image_url: result.url } : o)));
  }
  function removeOptionImage(index: number) {
    onChange(
      options.map((o, i) => {
        if (i !== index) return o;
        const { image_url: _image_url, ...rest } = o;
        return rest;
      }),
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
          <div key={index} className="space-y-1.5 rounded-lg border border-black/5 p-2">
            <div className="flex items-center gap-1.5">
              {option.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={option.image_url}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded object-cover"
                />
              ) : null}
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
            {editable && (
              <div className="flex items-center gap-2 pl-1">
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingIndex === index}
                  onChange={(e) => handleOptionImage(index, e.target.files?.[0])}
                  className="text-xs"
                />
                {uploadingIndex === index && <span className="field-hint">Uploading…</span>}
                {option.image_url && (
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => removeOptionImage(index)}
                  >
                    Remove image
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {uploadError && <p className="mt-2 text-sm text-[var(--color-accent)]">{uploadError}</p>}
      {editable && (
        <button type="button" className="btn btn-ghost mt-2 text-sm" onClick={add}>
          + Add option
        </button>
      )}
    </div>
  );
}
