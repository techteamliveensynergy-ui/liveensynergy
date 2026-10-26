"use client";

import { SAFE_UPLOAD_BYTES, formatBytes } from "@/lib/upload-limits";

export { SAFE_UPLOAD_BYTES };

/**
 * Browser-side helpers for the upload-on-select image pickers (survey
 * builder, survey branding). Two problems they fix (FB-00023/24, 10 Oct):
 *
 * 1. Vercel rejects a function request body over ~4.5 MB before our code
 *    runs, whatever next.config's serverActions.bodySizeLimit says. A 5.45 MB
 *    phone photo therefore never reached uploadImage()'s own 5 MB check —
 *    the server action call itself rejected.
 * 2. The pickers awaited that call with no error handling, so a rejection
 *    left "Uploading…" on screen forever with the file input disabled.
 *
 * shrinkImage() downsizes big photos before they leave the browser, and
 * uploadImageFile() wraps the whole thing so it always resolves to
 * { url } or { error } — never hangs, never throws.
 */

/** Longest edge kept — comfortably more than any survey placement shows. */
const MAX_EDGE_PX = 2400;
/** Files already this small are sent untouched (keeps PNG/GIF exactly as made). */
const SHRINK_ABOVE_BYTES = 1.5 * 1024 * 1024;

async function loadBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null; // a format this browser can't decode (e.g. some AVIF/HEIC)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns the file unchanged when it's small, animated (GIF) or undecodable;
 * otherwise re-encodes it as WebP (alpha kept) no larger than MAX_EDGE_PX on
 * its longest side, falling back to JPEG where WebP encoding isn't supported.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  const bitmap = await loadBitmap(file);
  if (!bitmap) return file;

  const longest = Math.max(bitmap.width, bitmap.height);
  if (file.size <= SHRINK_ABOVE_BYTES && longest <= MAX_EDGE_PX) {
    bitmap.close();
    return file;
  }

  const scale = Math.min(1, MAX_EDGE_PX / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let blob = await canvasToBlob(canvas, "image/webp", 0.86);
  let type = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
    type = "image/jpeg";
  }
  if (!blob || blob.size >= file.size) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.${type === "image/webp" ? "webp" : "jpg"}`, { type });
}

/**
 * Shrinks, size-checks and uploads one image through an upload server
 * action (`(formData) => Promise<{ url?, error? }>`, file under "file").
 * Always resolves — a rejected call (network drop, request too large,
 * deploy mid-upload) becomes a readable { error }.
 */
export async function uploadImageFile(
  file: File,
  action: (formData: FormData) => Promise<{ url?: string; error?: string }>,
): Promise<{ url?: string; error?: string }> {
  try {
    const ready = await shrinkImage(file);
    if (ready.size > SAFE_UPLOAD_BYTES) {
      return {
        error: `This image is ${formatBytes(ready.size)} even after resizing — please use one under ${formatBytes(SAFE_UPLOAD_BYTES)}.`,
      };
    }
    const form = new FormData();
    form.set("file", ready);
    return await action(form);
  } catch (err) {
    console.error("[upload] image upload failed", err);
    return {
      error: "The upload didn't go through — check your connection and try again. If it keeps failing, try a smaller image.",
    };
  }
}
