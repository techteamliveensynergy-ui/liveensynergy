"use client";

import { useRef, useState, type DragEvent } from "react";

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
}

/**
 * Drag-and-drop wrapper around a plain `<input type="file">`. The input keeps
 * its `name`, so the surrounding server action receives the file exactly as it
 * would from an unstyled form — this component only adds the drop target and
 * the preview.
 */
export function FileDrop({
  name,
  accept = "image/*",
  hint,
  currentUrl,
  preview = true,
  label = "Drag a file here, or click to browse",
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function adopt(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setFileName(file.name);
    if (preview && file.type.startsWith("image/")) {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!inputRef.current) return;
    // Assigning to the input's own FileList is what makes the dropped file part
    // of the form submission.
    inputRef.current.files = e.dataTransfer.files;
    adopt(e.dataTransfer.files);
  }

  function clear() {
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
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
        onChange={(e) => adopt(e.target.files)}
      />

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
