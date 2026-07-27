"use client";

import { useRef, useState, type DragEvent } from "react";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, fileError } from "@/lib/upload-limits";

interface FileDropProps {
  name: string;
  /** Native `accept` string, e.g. "image/*". */
  accept?: string;
  /** Shown under the drop zone. */
  hint?: string;
  /** Existing image to show until a new one is picked. */
  currentUrl?: string | null;
  /** Renders a thumbnail of the chosen file. Off for non-image uploads. */
  preview?: boolean;
  label?: string;
  /** Size ceiling. Must match what the receiving server action enforces. */
  maxBytes?: number;
  /** MIME allow-list, or `null` to accept any type within `maxBytes`. */
  allowedTypes?: string[] | null;
}

/**
 * Drag-and-drop wrapper around a plain `<input type="file">`. The input keeps
 * its `name`, so the surrounding server action receives the file exactly as it
 * would from an unstyled form — this component only adds the drop target, the
 * preview, and an up-front size/type check.
 *
 * That check matters: an over-limit file isn't merely rejected later, it takes
 * the whole Server Action request down at the body-size limit, which surfaces
 * as a blank error screen rather than anything the form can report. Refusing
 * the file here keeps the failure inside the form.
 */
export function FileDrop({
  name,
  accept = "image/*",
  hint,
  currentUrl,
  preview = true,
  label = "Drag a file here, or click to browse",
  maxBytes = MAX_IMAGE_BYTES,
  allowedTypes = IMAGE_TYPES,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  /** Returns true when the file passed validation and was taken on. */
  function adopt(files: FileList | null) {
    const file = files?.[0];
    if (!file) return false;

    const problem = fileError(file, { maxBytes, allowedTypes });
    if (problem) {
      reset();
      setError(problem);
      return false;
    }

    setError(null);
    setFileName(file.name);
    if (preview && file.type.startsWith("image/")) {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
    }
    return true;
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const input = inputRef.current;
    if (!input) return;
    // Validate before adopting — assigning to the input's own FileList is what
    // makes the dropped file part of the form submission, so a rejected file
    // must never get that far.
    if (!adopt(e.dataTransfer.files)) return;
    input.files = e.dataTransfer.files;
  }

  function clear() {
    reset();
    setError(null);
  }

  const shownImage = previewUrl ?? currentUrl ?? null;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition ${
          dragging
            ? "border-[var(--color-brand)] bg-[var(--color-gold)]/30"
            : "border-black/15 hover:border-[var(--color-brand)]/60 hover:bg-[var(--color-mist)]"
        }`}
      >
        {preview && shownImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownImage}
            alt=""
            className="h-16 w-24 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-[var(--color-mist)] text-2xl">
            {preview ? "🖼️" : "📎"}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-ink)]">
            {fileName ?? label}
          </p>
          {hint && (
            <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">{hint}</p>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        className="sr-only"
        aria-invalid={error ? true : undefined}
        onChange={(e) => adopt(e.target.files)}
      />

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-xs text-[var(--color-accent)]"
        >
          {error}
        </p>
      )}

      {fileName && (
        <button
          type="button"
          onClick={clear}
          className="mt-2 text-xs font-semibold text-[var(--color-accent)] hover:underline"
        >
          Remove file
        </button>
      )}
    </div>
  );
}
