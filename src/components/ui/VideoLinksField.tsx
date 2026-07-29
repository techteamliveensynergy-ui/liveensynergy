"use client";

import { useState } from "react";
import { UrlInput } from "@/components/ui/UrlInput";

const MAX_LINKS = 6;

/**
 * Repeatable list of showcase video links.
 *
 * Each row posts as `video_urls` so the action receives them via
 * `formData.getAll("video_urls")`. Blank rows are ignored server-side, so the
 * user can leave one empty without it becoming an error.
 */
export function VideoLinksField({
  defaultValues,
}: {
  defaultValues?: string[] | null;
}) {
  const initial =
    defaultValues && defaultValues.length > 0 ? defaultValues : [""];
  // Row identity has to survive removals, otherwise React reuses inputs and the
  // wrong value sticks to the wrong row.
  const [rows, setRows] = useState<{ key: number; value: string }[]>(
    initial.map((value, i) => ({ key: i, value })),
  );
  const [nextKey, setNextKey] = useState(initial.length);

  function addRow() {
    setRows((r) => [...r, { key: nextKey, value: "" }]);
    setNextKey((k) => k + 1);
  }

  function removeRow(key: number) {
    setRows((r) => (r.length === 1 ? [{ key, value: "" }] : r.filter((x) => x.key !== key)));
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.key} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <UrlInput
              id={`video_urls_${row.key}`}
              name="video_urls"
              label={`Video link ${i + 1}`}
              placeholder="e.g. youtube.com/watch?v=… or vimeo.com/…"
              defaultValue={row.value}
            />
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              aria-label={`Remove video link ${i + 1}`}
              className="mt-1 shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--color-accent)] hover:bg-[var(--color-pink)]"
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {rows.length < MAX_LINKS && (
        <button
          type="button"
          onClick={addRow}
          className="btn btn-ghost text-sm"
        >
          + Add another video link
        </button>
      )}
    </div>
  );
}
