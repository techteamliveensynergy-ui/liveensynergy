"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { shrinkImage } from "@/lib/image-upload";
import {
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  SAFE_UPLOAD_BYTES,
  fileError,
  formatBytes,
} from "@/lib/upload-limits";

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
 *
 * On Vercel that limit is ~4.5 MB for the whole request (#35), so big photos
 * are resized here first (the smaller copy replaces the picked file in the
 * input), no single file may pass SAFE_UPLOAD_BYTES, and the first FileDrop
 * in a form also stops a submit whose files add up to more than that.
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
  const [resizing, setResizing] = useState(false);
  const [totalError, setTotalError] = useState<string | null>(null);
  /** Ignores a resize that finishes after a newer pick or a clear. */
  const pickRef = useRef(0);
  const limit = Math.min(maxBytes, SAFE_UPLOAD_BYTES);

  // One FileDrop per form guards the combined size of every file in it.
  useEffect(() => {
    const input = inputRef.current;
    const form = input?.form;
    if (!input || !form) return;
    if (form.querySelector("input[type=file][data-filedrop]") !== input) return;

    function onSubmit(e: SubmitEvent) {
      const total = Array.from(
        form!.querySelectorAll<HTMLInputElement>("input[type=file]"),
      ).reduce(
        (sum, el) =>
          sum + Array.from(el.files ?? []).reduce((s, f) => s + f.size, 0),
        0,
      );
      if (total <= SAFE_UPLOAD_BYTES) {
        setTotalError(null);
        return;
      }
      // React's form action skips a submit whose default was prevented.
      e.preventDefault();
      setTotalError(
        `Together these files are ${formatBytes(total)} — one save can carry ${formatBytes(
          SAFE_UPLOAD_BYTES,
        )}. Remove a file or use smaller ones, then save again.`,
      );
      input!.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  function reset() {
    pickRef.current += 1;
    setResizing(false);
    inputRef.current?.setCustomValidity("");
    if (inputRef.current) inputRef.current.value = "";
    setFileName(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }

  function show(file: File) {
    setError(null);
    setFileName(file.name);
    if (preview && file.type.startsWith("image/")) {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(file);
      });
    }
  }

  /**
   * Validates the picked file, resizing a big photo first, and puts the file
   * that will actually be sent into the input. While a resize runs the input
   * reports itself invalid, so the form can't be submitted without it.
   */
  async function adopt(files: FileList | null) {
    const input = inputRef.current;
    const picked = files?.[0];
    if (!input || !picked) return;

    const typeProblem = fileError(picked, { maxBytes: Infinity, allowedTypes });
    if (typeProblem) {
      reset();
      setError(typeProblem);
      return;
    }

    const pick = ++pickRef.current;
    let file = picked;
    if (picked.type.startsWith("image/")) {
      setResizing(true);
      setError(null);
      setFileName(picked.name);
      input.setCustomValidity("Still preparing your image — one moment.");
      try {
        file = await shrinkImage(picked);
      } catch {
        file = picked;
      }
      if (pick !== pickRef.current) return;
      setResizing(false);
      input.setCustomValidity("");
    }

    const sizeProblem = fileError(file, { maxBytes: limit, allowedTypes });
    if (sizeProblem) {
      reset();
      setError(
        file !== picked
          ? `This image is still ${formatBytes(file.size)} after resizing — the limit is ${formatBytes(limit)}. Please use a smaller one.`
          : sizeProblem,
      );
      return;
    }

    if (file !== picked || input.files?.[0] !== picked) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    }
    show(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    // adopt() validates before it writes the file into the input — that
    // assignment is what makes it part of the form submission, so a rejected
    // file never gets that far.
    void adopt(e.dataTransfer.files);
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
          {resizing && (
            <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">Resizing for upload…</p>
          )}
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
        data-filedrop=""
        className="sr-only"
        aria-invalid={error || totalError ? true : undefined}
        onChange={(e) => void adopt(e.target.files)}
      />

      {(error ?? totalError) && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-[var(--color-pink)] px-3 py-2 text-xs text-[var(--color-accent)]"
        >
          {error ?? totalError}
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
